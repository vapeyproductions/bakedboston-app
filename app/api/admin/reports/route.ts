import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { supportReports } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { writeAudit } from "../../../audit";

export async function PATCH(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const id = Number(body.id);
  const status = String(body.status);
  if (!Number.isInteger(id) || !["submitted", "reviewing", "resolved", "closed"].includes(status)) return Response.json({ error: "Invalid report update." }, { status: 400 });
  const [report] = await getDb().update(supportReports).set({ status: status as "submitted" | "reviewing" | "resolved" | "closed", adminNotes: String(body.adminNotes ?? ""), updatedAt: new Date() }).where(eq(supportReports.id, id)).returning();
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
  await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: `marked support report ${status}`, entityType: "support_report", entityId: id });
  return Response.json({ report });
}
