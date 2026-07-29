import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adminInboxMessages, supportReportMessages, supportReports } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { reportCaseId } from "../../../report-email";
import { writeAudit } from "../../../audit";

const INFO_FROM = "BakedBoston <info@baked-boston.com>";

export async function GET() {
  if (!(await getAdministrator())) return Response.json({ error: "Sign in required." }, { status: 401 });
  const messages = await getDb().select().from(adminInboxMessages).orderBy(desc(adminInboxMessages.createdAt)).limit(500);
  return Response.json({ messages });
}

export async function PATCH(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const id = Number(body.id);
  const action = String(body.action ?? "");
  if (!Number.isInteger(id)) return Response.json({ error: "A message is required." }, { status: 400 });
  const [message] = await getDb().select().from(adminInboxMessages).where(eq(adminInboxMessages.id, id)).limit(1);
  if (!message) return Response.json({ error: "Message not found." }, { status: 404 });

  if (action === "read" || action === "archive" || action === "restore") {
    const status = action === "archive" ? "archived" : action === "restore" ? "unread" : "read";
    const [updated] = await getDb().update(adminInboxMessages).set({ status, updatedAt: new Date() }).where(eq(adminInboxMessages.id, id)).returning();
    return Response.json({ message: updated });
  }

  if (action === "link" || action === "create_report") {
    let reportId = Number(body.reportId);
    if (action === "create_report") {
      const urgency = ["routine", "urgent", "safety"].includes(String(body.urgency)) ? String(body.urgency) as "routine" | "urgent" | "safety" : "routine";
      const [report] = await getDb().insert(supportReports).values({
        reporterType: "system",
        reporterName: message.senderEmail || "Email sender",
        category: String(body.category ?? "email_request"),
        urgency,
        details: message.body,
        status: "reviewing",
        unreadReplyCount: 1,
      }).returning();
      reportId = report.id;
    }
    if (!Number.isInteger(reportId)) return Response.json({ error: "Choose a report." }, { status: 400 });
    const [report] = await getDb().select().from(supportReports).where(eq(supportReports.id, reportId)).limit(1);
    if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
    try {
      await getDb().insert(supportReportMessages).values({
        reportId,
        direction: "inbound",
        senderEmail: message.senderEmail,
        recipientEmails: message.recipientEmails,
        subject: message.subject,
        body: message.body,
        externalEmailId: message.externalEmailId,
      });
    } catch {
      return Response.json({ error: "This email is already attached to a report." }, { status: 409 });
    }
    await getDb().update(supportReports).set({ status: "reviewing", unreadReplyCount: 1, updatedAt: new Date() }).where(eq(supportReports.id, reportId));
    await getDb().update(adminInboxMessages).set({ status: "archived", linkedReportId: reportId, updatedAt: new Date() }).where(eq(adminInboxMessages.id, id));
    await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: action === "create_report" ? "created report from inbox email" : "linked inbox email to report", entityType: "support_report", entityId: reportId, entityName: reportCaseId(reportId) });
    return Response.json({ ok: true, reportId });
  }
  return Response.json({ error: "Invalid inbox action." }, { status: 400 });
}

export async function POST(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const compose = Boolean(body.compose);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return Response.json({ error: "Resend is not configured." }, { status: 400 });

  if (compose) {
    const recipient = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const text = String(body.message ?? "").trim();
    if (!recipient || !subject || !text) return Response.json({ error: "Recipient, subject, and message are required." }, { status: 400 });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: INFO_FROM,
        to: [recipient],
        reply_to: "info@baked-boston.com",
        subject,
        text: `${text}\n\nBakedBoston`,
      }),
    });
    const result = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) return Response.json({ error: result.message ?? "Could not send email." }, { status: 400 });
    await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: "sent general inbox email", entityType: "admin_inbox", entityId: null, entityName: subject });
    return Response.json({ ok: true });
  }

  const id = Number(body.id);
  const text = String(body.message ?? "").trim();
  if (!Number.isInteger(id) || !text) return Response.json({ error: "A message and reply are required." }, { status: 400 });
  const [message] = await getDb().select().from(adminInboxMessages).where(and(eq(adminInboxMessages.id, id))).limit(1);
  if (!message?.senderEmail) return Response.json({ error: "This email has no reply address." }, { status: 400 });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: INFO_FROM,
      to: [message.senderEmail],
      reply_to: "info@baked-boston.com",
      subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
      text: `${text}\n\nBakedBoston`,
    }),
  });
  const result = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) return Response.json({ error: result.message ?? "Could not send reply." }, { status: 400 });
  await getDb().update(adminInboxMessages).set({ status: "read", updatedAt: new Date() }).where(eq(adminInboxMessages.id, id));
  await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: "replied to inbox email", entityType: "admin_inbox_message", entityId: id, entityName: message.subject });
  return Response.json({ ok: true });
}
