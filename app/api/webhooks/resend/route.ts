import { createHmac, timingSafeEqual } from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { supportReportMessages, supportReports } from "../../../../db/schema";

type ReceivedEvent = {
  type: string;
  data?: { email_id?: string; from?: string; to?: string[]; subject?: string };
};

export async function POST(request: Request) {
  const payload = await request.text();
  if (!verifyWebhook(payload, request.headers)) return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  const event = JSON.parse(payload) as ReceivedEvent;
  if (event.type !== "email.received" || !event.data?.email_id) return Response.json({ ok: true });
  const caseId = findCaseId([...(event.data.to ?? []), event.data.subject ?? ""]);
  if (!caseId) return Response.json({ ok: true, ignored: true });
  const reportId = Number(caseId.split("-")[1]);
  const [report] = await getDb().select({ id: supportReports.id }).from(supportReports).where(eq(supportReports.id, reportId)).limit(1);
  if (!report) return Response.json({ ok: true, ignored: true });
  const content = await retrieveReceivedEmail(event.data.email_id);
  try {
    await getDb().insert(supportReportMessages).values({
      reportId,
      direction: "inbound",
      senderEmail: event.data.from ?? content.from ?? "",
      recipientEmails: JSON.stringify(event.data.to ?? []),
      subject: event.data.subject ?? content.subject ?? `[${caseId}] Reply`,
      body: cleanReply(content.text || stripHtml(content.html || "") || "Reply received without readable text."),
      externalEmailId: event.data.email_id,
    });
    await getDb().update(supportReports).set({
      unreadReplyCount: sql`${supportReports.unreadReplyCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(supportReports.id, reportId));
  } catch {
    // Resend retries webhooks. Treat an already-stored email id as successfully processed.
  }
  return Response.json({ ok: true });
}

function verifyWebhook(payload: string, headers: Headers) {
  const configured = process.env.RESEND_WEBHOOK_SECRET ?? "";
  const id = headers.get("svix-id") ?? "";
  const timestamp = headers.get("svix-timestamp") ?? "";
  const supplied = headers.get("svix-signature") ?? "";
  if (!configured || !id || !timestamp || !supplied) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 5 * 60) return false;
  const secret = configured.startsWith("whsec_") ? configured.slice(6) : configured;
  let key: Buffer;
  try { key = Buffer.from(secret, "base64"); } catch { return false; }
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();
  return supplied.split(" ").some((signature) => {
    const encoded = signature.startsWith("v1,") ? signature.slice(3) : "";
    if (!encoded) return false;
    const candidate = Buffer.from(encoded, "base64");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

async function retrieveReceivedEmail(id: string) {
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}` } });
  if (!response.ok) return {} as { text?: string; html?: string; from?: string; subject?: string };
  const result = await response.json() as Record<string, unknown>;
  return (result.data && typeof result.data === "object" ? result.data : result) as { text?: string; html?: string; from?: string; subject?: string };
}

function findCaseId(values: string[]) {
  const match = values.join(" ").match(/BBR-(\d{6})/i);
  return match ? `BBR-${match[1]}` : "";
}

function stripHtml(value: string) {
  return value.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function cleanReply(value: string) {
  return value.split(/\nOn .+wrote:\n/i)[0].trim().slice(0, 20_000);
}
