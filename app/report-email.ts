import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { driverAccounts, organizationContacts, partnerAccounts, supportReportMessages, supportReports } from "../db/schema";

const HELP_FROM = "BakedBoston Help <help@baked-boston.com>";

export function reportCaseId(id: number) {
  return `BBR-${String(id).padStart(6, "0")}`;
}

export async function reportRecipients(report: typeof supportReports.$inferSelect) {
  const db = getDb();
  if (report.reporterType === "driver" && report.reporterId) {
    const [driver] = await db.select({ email: driverAccounts.email }).from(driverAccounts).where(eq(driverAccounts.id, report.reporterId)).limit(1);
    return driver ? [driver.email] : [];
  }
  if ((report.reporterType === "bakery" || report.reporterType === "pantry") && report.reporterId) {
    const accounts = await db.select({ email: partnerAccounts.accountEmail }).from(partnerAccounts).where(and(
      eq(partnerAccounts.organizationType, report.reporterType),
      eq(partnerAccounts.organizationId, report.reporterId),
    ));
    const contacts = await db.select({ email: organizationContacts.email }).from(organizationContacts).where(and(
      eq(organizationContacts.organizationType, report.reporterType),
      eq(organizationContacts.organizationId, report.reporterId),
      eq(organizationContacts.isPrimary, true),
    ));
    return uniqueEmails([...accounts.map((account) => account.email), ...contacts.map((contact) => contact.email)]);
  }
  return [];
}

export async function sendReportEmail(input: {
  report: typeof supportReports.$inferSelect;
  body: string;
  purpose: "message" | "resolution";
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend is not configured.");
  const recipients = await reportRecipients(input.report);
  if (!recipients.length) throw new Error("This report has no available recipient email.");
  const caseId = reportCaseId(input.report.id);
  const subject = `[${caseId}] ${input.purpose === "resolution" ? "Report resolution" : "BakedBoston report follow-up"}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: HELP_FROM,
      to: recipients,
      reply_to: `help+${caseId.toLowerCase()}@baked-boston.com`,
      subject,
      text: `${input.body}\n\nReport ID: ${caseId}\n\nBakedBoston`,
      html: `<div style="margin:0;background:#f5f0e6;padding:28px 12px;font-family:Arial,sans-serif;color:#24372f"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #ded6c7;border-radius:16px;overflow:hidden"><div style="background:#173b2d;padding:27px 32px;color:#fff"><div style="font-size:13px;letter-spacing:2px;color:#efc86e">BAKEDBOSTON HELP · ${caseId}</div><h1 style="margin:9px 0 0;font-size:27px">${input.purpose === "resolution" ? "Report resolution" : "Report follow-up"}</h1></div><div style="padding:30px 32px"><p style="font-size:16px;line-height:1.65;white-space:pre-wrap">${escapeHtml(input.body)}</p><p style="font-size:13px;color:#63786d">Reply directly to this email to continue the conversation. Please keep the report ID in the subject line.</p><p style="margin:28px 0 0"><strong>BakedBoston</strong></p></div></div></div>`,
    }),
  });
  const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok) throw new Error(result.message ?? "Could not send the report email.");
  await getDb().insert(supportReportMessages).values({
    reportId: input.report.id,
    direction: "outbound",
    senderEmail: "help@baked-boston.com",
    recipientEmails: JSON.stringify(recipients),
    subject,
    body: input.body,
    externalEmailId: result.id ?? "",
  });
  return { recipients, externalEmailId: result.id ?? "" };
}

function uniqueEmails(values: string[]) {
  return [...new Set(values.map((email) => email.trim().toLowerCase()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}
