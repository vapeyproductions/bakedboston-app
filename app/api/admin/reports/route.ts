import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { supportReports } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { writeAudit } from "../../../audit";
import { sendReportEmail } from "../../../report-email";

export async function POST(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const id = Number(body.id);
  const message = String(body.message ?? "").trim();
  if (!Number.isInteger(id) || !message) return Response.json({ error: "A report and message are required." }, { status: 400 });
  const [report] = await getDb().select().from(supportReports).where(eq(supportReports.id, id)).limit(1);
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
  try {
    const delivery = await sendReportEmail({ report, body: message, purpose: "message" });
    await getDb().update(supportReports).set({ status: "reviewing", unreadReplyCount: 0, updatedAt: new Date() }).where(eq(supportReports.id, id));
    await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: "emailed report contact", entityType: "support_report", entityId: id, entityName: `BBR-${String(id).padStart(6, "0")}` });
    return Response.json({ ok: true, delivery });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not send report email." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const id = Number(body.id);
  if (Number.isInteger(id) && body.markRead === true) {
    const [report] = await getDb().update(supportReports).set({ unreadReplyCount: 0, updatedAt: new Date() }).where(eq(supportReports.id, id)).returning();
    return report ? Response.json({ report }) : Response.json({ error: "Report not found." }, { status: 404 });
  }
  const status = String(body.status);
  if (!Number.isInteger(id) || !["submitted", "reviewing", "resolved", "closed"].includes(status)) return Response.json({ error: "Invalid report update." }, { status: 400 });
  const [existing] = await getDb().select().from(supportReports).where(eq(supportReports.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Report not found." }, { status: 404 });
  const resolutionSummary = String(body.resolutionSummary ?? "").trim();
  if (status === "resolved" && !resolutionSummary) return Response.json({ error: "A resolution summary is required before resolving a report." }, { status: 400 });
  if (status === "resolved") {
    try {
      await sendReportEmail({ report: existing, body: resolutionSummary, purpose: "resolution" });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Could not send the resolution email." }, { status: 400 });
    }
  }
  const [report] = await getDb().update(supportReports).set({
    status: status as "submitted" | "reviewing" | "resolved" | "closed",
    adminNotes: String(body.adminNotes ?? ""),
    resolutionSummary: status === "resolved" ? resolutionSummary : existing.resolutionSummary,
    resolvedAt: status === "resolved" ? new Date() : null,
    unreadReplyCount: 0,
    updatedAt: new Date(),
  }).where(eq(supportReports.id, id)).returning();
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
  await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: `marked support report ${status}`, entityType: "support_report", entityId: id });
  return Response.json({ report });
}
