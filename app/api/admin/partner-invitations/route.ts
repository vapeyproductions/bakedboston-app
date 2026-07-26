import { createHash, randomBytes } from "crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, organizationContacts, pantries, partnerInvitations } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { writeAudit } from "../../../audit";

export async function POST(request: Request) {
  const actor = await getAdministrator();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const organizationType = String(body.organizationType);
    const organizationId = Number(body.organizationId);
    const accountEmail = validEmail(body.accountEmail);
    if ((organizationType !== "bakery" && organizationType !== "pantry") || !Number.isInteger(organizationId) || organizationId < 1) {
      throw new Error("A valid organization is required.");
    }

    const db = getDb();
    const table = organizationType === "bakery" ? bakeries : pantries;
    const [organization] = await db.select({ name: table.name }).from(table).where(eq(table.id, organizationId)).limit(1);
    if (!organization) throw new Error("Organization not found.");
    const [{ value: contactCount }] = await db.select({ value: count() }).from(organizationContacts).where(and(
      eq(organizationContacts.organizationType, organizationType),
      eq(organizationContacts.organizationId, organizationId),
    ));
    if (Number(contactCount) < 1) throw new Error("Add at least one primary organizational contact before connecting an account.");
    await db.delete(partnerInvitations).where(and(
      eq(partnerInvitations.organizationType, organizationType),
      eq(partnerInvitations.organizationId, organizationId),
      isNull(partnerInvitations.acceptedAt),
    ));
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(partnerInvitations).values({
      organizationType, organizationId, accountEmail, tokenHash, expiresAt,
    });

    const origin = process.env.PUBLIC_APP_URL ?? new URL(request.url).origin;
    const invitationUrl = `${origin}/register/partner?token=${encodeURIComponent(token)}`;
    const emailSent = await sendInvitationEmail({
      to: accountEmail, organizationName: organization.name, organizationType, invitationUrl,
    });
    await writeAudit({
      actorType: "admin", actorId: actor.id, actorName: actor.displayName,
      action: "invited partner account", entityType: organizationType,
      entityId: organizationId, entityName: organization.name, details: accountEmail,
    });
    return Response.json({ ok: true, emailSent, invitationUrl: emailSent ? undefined : invitationUrl });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not connect account." }, { status: 400 });
  }
}

async function sendInvitationEmail(input: {
  to: string; organizationName: string; organizationType: string; invitationUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PARTNER_INVITE_FROM;
  if (!apiKey || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: `Set up your ${input.organizationName} BakedBoston account`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#173b2d">
        <h1>Welcome to BakedBoston</h1>
        <p>A BakedBoston administrator has prepared the ${escapeHtml(input.organizationName)} ${input.organizationType} profile for you.</p>
        <p>Use the secure link below to confirm this account email and create your password. The link expires in seven days.</p>
        <p><a href="${input.invitationUrl}" style="display:inline-block;background:#173b2d;color:white;padding:13px 18px;text-decoration:none;border-radius:6px">Register account</a></p>
        <p>If you were not expecting this invitation, you can ignore this email.</p>
      </div>`,
    }),
  });
  return response.ok;
}

function validEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid account email is required.");
  return email;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}
