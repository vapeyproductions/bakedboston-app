import { createHash, randomBytes } from "crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adminAccounts, adminInvitations, auditLog } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { hashPartnerPassword } from "../../../partner-auth";

export async function POST(request: Request) {
  const actor = await getAdministrator();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action);
    const db = getDb();

    if (action === "invite") {
      const email = validEmail(body.email);
      const [existing] = await db.select({ id: adminAccounts.id }).from(adminAccounts).where(eq(adminAccounts.email, email)).limit(1);
      if (existing) throw new Error("That email already belongs to an administrator.");
      await db.delete(adminInvitations).where(and(eq(adminInvitations.email, email), isNull(adminInvitations.acceptedAt)));
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await db.insert(adminInvitations).values({
        email, tokenHash, invitedByAdminId: actor.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const origin = process.env.PUBLIC_APP_URL ?? new URL(request.url).origin;
      const invitationUrl = `${origin}/register/admin?token=${encodeURIComponent(token)}`;
      const emailSent = await sendAdminInvitation(email, actor.displayName, invitationUrl);
      await log(actor, "invited administrator", "admin_invitation", null, email, `Invitation sent by ${actor.email}`);
      return Response.json({ ok: true, emailSent, invitationUrl: emailSent ? undefined : invitationUrl });
    }

    if (action === "update-profile") {
      const email = validEmail(body.email);
      const displayName = required(body.displayName, "Display name");
      const password = String(body.newPassword ?? "");
      await db.update(adminAccounts).set({
        email, displayName, ...(password ? { passwordHash: hashPartnerPassword(password) } : {}),
        updatedAt: new Date(),
      }).where(eq(adminAccounts.id, actor.id));
      await log(actor, "updated administrator profile", "admin_account", actor.id, displayName, password ? "Display name, login email, and password updated" : "Display name or login email updated");
      return Response.json({ ok: true });
    }

    if (action === "transfer-master") {
      if (!actor.isMaster) return Response.json({ error: "Only the master administrator can transfer master status." }, { status: 403 });
      const targetId = Number(body.adminId);
      const [target] = await db.select().from(adminAccounts).where(and(eq(adminAccounts.id, targetId), eq(adminAccounts.active, true))).limit(1);
      if (!target || target.id === actor.id) throw new Error("Choose another active administrator.");
      await db.update(adminAccounts).set({ isMaster: true, updatedAt: new Date() }).where(eq(adminAccounts.id, target.id));
      await db.update(adminAccounts).set({ isMaster: false, updatedAt: new Date() }).where(eq(adminAccounts.id, actor.id));
      await log(actor, "transferred master administrator status", "admin_account", target.id, target.displayName, `Master status transferred from ${actor.email} to ${target.email}`);
      return Response.json({ ok: true });
    }

    if (action === "delete-admin") {
      if (!actor.isMaster) return Response.json({ error: "Only the master administrator can remove administrators." }, { status: 403 });
      const targetId = Number(body.adminId);
      const [target] = await db.select().from(adminAccounts).where(and(eq(adminAccounts.id, targetId), ne(adminAccounts.id, actor.id))).limit(1);
      if (!target || target.isMaster) throw new Error("The master administrator cannot be deleted.");
      await db.delete(adminAccounts).where(eq(adminAccounts.id, target.id));
      await log(actor, "deleted administrator account", "admin_account", target.id, target.displayName, target.email);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown settings action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update administrator settings." }, { status: 400 });
  }
}

async function log(actor: { id: number; displayName: string }, action: string, entityType: string, entityId: number | null, entityName: string, details: string) {
  await getDb().insert(auditLog).values({
    actorType: "admin", actorId: actor.id, actorName: actor.displayName,
    action, entityType, entityId, entityName, details,
  });
}

async function sendAdminInvitation(to: string, inviterName: string, invitationUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMIN_INVITE_FROM ?? process.env.PARTNER_INVITE_FROM;
  if (!apiKey || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [to], subject: "You’re invited to administer BakedBoston",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#173b2d"><h1>BakedBoston administrator invitation</h1><p>${escapeHtml(inviterName)} invited you to help administer BakedBoston.</p><p>This secure link expires in seven days.</p><p><a href="${invitationUrl}" style="display:inline-block;background:#173b2d;color:white;padding:13px 18px;text-decoration:none;border-radius:6px">Create administrator account</a></p></div>`,
    }),
  });
  return response.ok;
}

function required(value: unknown, label: string) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}
function validEmail(value: unknown) {
  const email = required(value, "Email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email.");
  return email;
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}
