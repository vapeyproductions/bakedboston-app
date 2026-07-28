import { eq, sql } from "drizzle-orm";
import { Webhook } from "svix";
import { getDb } from "../../../../db";
import { adminInboxMessages, supportReportMessages, supportReports } from "../../../../db/schema";

type ReceivedEvent = {
  type: string;
  data?: { email_id?: string; from?: string; to?: string[]; subject?: string };
};

export async function POST(request: Request) {
  const payload = await request.text();
  const verification = verifyWebhook(payload, request.headers);
  if (!verification.ok) return Response.json({
    error: "Invalid webhook signature.",
    diagnostics: verification.diagnostics,
  }, { status: 400 });
  const event = verification.event as ReceivedEvent;
  if (event.type !== "email.received" || !event.data?.email_id) return Response.json({ ok: true });
  const contentResult = await retrieveReceivedEmail(event.data.email_id);
  if (!contentResult.ok) return Response.json({
    error: "Could not retrieve received email content.",
    diagnostics: {
      resendApiKeyConfigured: Boolean((process.env.RESEND_API_KEY ?? "").trim()),
      receivingApiStatus: contentResult.status,
    },
  }, { status: 502 });
  const content = contentResult.content;
  const caseId = findCaseId([...(event.data.to ?? []), event.data.subject ?? ""]);
  const reportId = caseId ? Number(caseId.split("-")[1]) : 0;
  const [report] = reportId
    ? await getDb().select({ id: supportReports.id }).from(supportReports).where(eq(supportReports.id, reportId)).limit(1)
    : [];
  const message = {
    senderEmail: event.data.from ?? content.from ?? "",
    recipientEmails: JSON.stringify(event.data.to ?? []),
    subject: event.data.subject ?? content.subject ?? (caseId ? `[${caseId}] Reply` : "(No subject)"),
    body: cleanReply(content.text || stripHtml(content.html || "") || "Message received without readable text."),
    externalEmailId: event.data.email_id,
  };
  if (!report) {
    try {
      await getDb().insert(adminInboxMessages).values(message).onConflictDoUpdate({
        target: adminInboxMessages.externalEmailId,
        set: {
          senderEmail: message.senderEmail,
          recipientEmails: message.recipientEmails,
          subject: message.subject,
          body: message.body,
          updatedAt: new Date(),
        },
      });
    } catch {
      // Resend retries webhooks. Treat an already-stored email id as successfully processed.
    }
    return Response.json({ ok: true, inbox: true });
  }
  try {
    await getDb().insert(supportReportMessages).values({
      reportId,
      direction: "inbound",
      ...message,
    }).onConflictDoUpdate({
      target: supportReportMessages.externalEmailId,
      set: {
        senderEmail: message.senderEmail,
        recipientEmails: message.recipientEmails,
        subject: message.subject,
        body: message.body,
      },
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

function verifyWebhook(payload: string, headers: Headers): {
  ok: true;
  event: unknown;
} | {
  ok: false;
  diagnostics: Record<string, boolean | number>;
} {
  const configured = (process.env.RESEND_WEBHOOK_SECRET ?? "").trim();
  const id = headers.get("svix-id") ?? "";
  const timestamp = headers.get("svix-timestamp") ?? "";
  const supplied = headers.get("svix-signature") ?? "";
  const diagnostics = {
    secretConfigured: Boolean(configured),
    secretHasExpectedPrefix: configured.startsWith("whsec_"),
    configuredLength: configured.length,
    idReceived: Boolean(id),
    timestampReceived: Boolean(timestamp),
    signatureReceived: Boolean(supplied),
    signatureLength: supplied.length,
  };
  if (!configured || !id || !timestamp || !supplied) return { ok: false, diagnostics };
  try {
    return {
      ok: true,
      event: new Webhook(configured).verify(payload, {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": supplied,
      }),
    };
  } catch {
    return { ok: false, diagnostics };
  }
}

async function retrieveReceivedEmail(id: string) {
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${(process.env.RESEND_API_KEY ?? "").trim()}` } });
  if (!response.ok) return { ok: false as const, status: response.status };
  const result = await response.json() as Record<string, unknown>;
  return {
    ok: true as const,
    content: (result.data && typeof result.data === "object" ? result.data : result) as { text?: string; html?: string; from?: string; subject?: string },
  };
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
