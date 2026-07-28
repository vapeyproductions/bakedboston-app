const ACCOUNT_FROM = "BakedBoston Accounts <account@baked-boston.com>";

export async function sendAccountStatusEmail(input: {
  to: string[];
  recipientName: string;
  accountType: "bakery" | "pantry" | "driver";
  action: "disabled" | "restored" | "deleted";
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipients = [...new Set(input.to.map((email) => email.trim().toLowerCase()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
  if (!apiKey || !recipients.length) return false;
  const wording = input.action === "disabled"
    ? {
      subject: `Your BakedBoston ${input.accountType} account has been temporarily disabled`,
      heading: "Account temporarily disabled",
      body: `The BakedBoston administrator team has temporarily disabled the ${input.accountType} account for ${input.recipientName}. This may happen while a reported issue or account concern is being reviewed. The account cannot be used to sign in until it is restored.`,
      note: "If you believe this was unexpected or need more information, please reply to this email or contact BakedBoston.",
    }
    : input.action === "restored"
      ? {
        subject: `Your BakedBoston ${input.accountType} account has been restored`,
        heading: "Account access restored",
        body: `The BakedBoston administrator team has restored the ${input.accountType} account for ${input.recipientName}. The account may now be used to sign in again.`,
        note: "Thank you for being part of the BakedBoston community.",
      }
      : {
        subject: `Your BakedBoston ${input.accountType} account has been deleted`,
        heading: "Account deleted",
        body: `The BakedBoston administrator team has permanently deleted the ${input.accountType} profile and login account for ${input.recipientName}. Access to this account is no longer available.`,
        note: "If you believe this was a mistake or need assistance, please reply to this email or contact BakedBoston.",
      };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ACCOUNT_FROM,
      to: recipients,
      subject: wording.subject,
      html: `<div style="margin:0;background:#f5f0e6;padding:28px 12px;font-family:Arial,sans-serif;color:#24372f">
        <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #ded6c7;border-radius:16px;overflow:hidden">
          <div style="background:#173b2d;padding:27px 32px;color:#fff"><div style="font-size:13px;letter-spacing:2px;color:#efc86e">BAKEDBOSTON</div><h1 style="margin:9px 0 0;font-size:27px">${escapeHtml(wording.heading)}</h1></div>
          <div style="padding:30px 32px"><p style="font-size:16px;line-height:1.65;margin-top:0">${escapeHtml(wording.body)}</p><p style="font-size:14px;line-height:1.6;color:#63786d">${escapeHtml(wording.note)}</p><p style="margin:28px 0 0"><strong>BakedBoston</strong></p></div>
        </div>
      </div>`,
    }),
  });
  return response.ok;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}
