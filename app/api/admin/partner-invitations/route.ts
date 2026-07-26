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
    const [organization] = organizationType === "pantry"
      ? await db.select().from(pantries).where(eq(pantries.id, organizationId)).limit(1)
      : await db.select().from(bakeries).where(eq(bakeries.id, organizationId)).limit(1);
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
    const contacts = await db.select().from(organizationContacts).where(and(
      eq(organizationContacts.organizationType, organizationType),
      eq(organizationContacts.organizationId, organizationId),
    ));
    const emailSent = await sendInvitationEmail({
      to: accountEmail, organization, contacts, organizationType, invitationUrl,
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
  to: string;
  organization: typeof pantries.$inferSelect | typeof bakeries.$inferSelect;
  contacts: Array<typeof organizationContacts.$inferSelect>;
  organizationType: string;
  invitationUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PARTNER_INVITE_FROM ?? "BakedBoston Onboarding <onboarding@baked-boston.com>";
  if (!apiKey) return false;
  const organizationName = input.organization.name;
  const orderedContacts = [...input.contacts].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
  const primaryContact = orderedContacts[0];
  const pantry = input.organizationType === "pantry" ? input.organization as typeof pantries.$inferSelect : null;
  const bakery = input.organizationType === "bakery" ? input.organization as typeof bakeries.$inferSelect : null;
  const buttonLabel = pantry ? "Connect Pantry" : "Connect Bakery";
  const pantrySchedule = pantry ? describePantrySchedule(pantry) : [];
  const bakerySchedule = bakery ? describeBakerySchedule(bakery) : [];
  const field = (label: string, value: string, explanation: string) => `<tr><td style="padding:14px 0;border-bottom:1px solid #e7e0d2"><strong style="display:block;color:#173b2d">${escapeHtml(label)}</strong><span style="display:block;margin:4px 0;color:#2e4038">${escapeHtml(value || "Not yet provided")}</span><small style="color:#69756e;line-height:1.45">${escapeHtml(explanation)}</small></td></tr>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: `Connect ${organizationName} to BakedBoston`,
      html: `<div style="margin:0;background:#f5f0e6;padding:28px 12px;font-family:Arial,sans-serif;color:#24372f">
        <div style="max-width:640px;margin:auto;background:#fff;border:1px solid #ded6c7;border-radius:16px;overflow:hidden">
          <div style="background:#173b2d;padding:28px 34px;color:#fff"><div style="font-size:13px;letter-spacing:2px;color:#efc86e">BAKEDBOSTON</div><h1 style="margin:9px 0 0;font-size:28px">Welcome, ${escapeHtml(primaryContact?.name || organizationName)}!</h1></div>
          <div style="padding:32px 34px">
            <p style="font-size:17px;line-height:1.6;margin-top:0">Your ${escapeHtml(organizationName)} profile has been prepared. Use the secure link below to confirm the account email and create a password. This link expires in seven days.</p>
            <p style="text-align:center;margin:30px 0"><a href="${escapeHtml(input.invitationUrl)}" style="display:inline-block;background:#e8b84c;color:#173b2d;padding:16px 30px;text-decoration:none;border-radius:8px;font-size:17px;font-weight:bold">${buttonLabel}</a></p>
            ${pantry ? `<div style="margin-top:34px;border-top:4px solid #173b2d;padding-top:22px"><h2 style="margin:0 0 4px;color:#173b2d">Summary of Pantry Information</h2><p style="color:#69756e;line-height:1.5">Please review the information entered during onboarding.</p><table style="width:100%;border-collapse:collapse">
              ${orderedContacts.map((contact, index) => field(index === 0 ? "Primary contact" : `Additional contact ${index}`, `${contact.name} · ${contact.email} · ${contact.phone}`, "A person BakedBoston administrators may contact directly about this pantry.")).join("")}
              ${field("Delivery address", pantry.address, `The street address drivers will navigate to for deliveries to ${organizationName}.`)}
              ${field("Drop-off instructions", pantry.dropoffInstructions, "Directions that help drivers locate the exact receiving point after arriving at the delivery address.")}
              ${field("Business phone number", pantry.businessPhone, "The number drivers and partner organizations may call during business hours.")}
              ${field("Notification contact", pantry.notificationPhone, "The email address or phone number monitored for upcoming delivery confirmations and notifications.")}
              ${pantrySchedule.map((window, index) => field(`Receiving window ${index + 1}`, window.summary, `${window.openDescription} ${window.closeDescription} ${window.latestDescription}`)).join("")}
            </table></div>` : bakery ? `<div style="margin-top:34px;border-top:4px solid #173b2d;padding-top:22px"><h2 style="margin:0 0 4px;color:#173b2d">Summary of Bakery Information</h2><p style="color:#69756e;line-height:1.5">Please review the information entered during onboarding.</p><table style="width:100%;border-collapse:collapse">
              ${orderedContacts.map((contact, index) => field(index === 0 ? "Primary contact" : `Additional contact ${index}`, `${contact.name} · ${contact.email} · ${contact.phone}`, "A person BakedBoston administrators may contact directly about this bakery.")).join("")}
              ${field("Pickup address", bakery.address, `The street address drivers will navigate to for pickups from ${organizationName}.`)}
              ${field("Pickup instructions", bakery.dropoffInstructions, "Directions that help drivers locate the exact pickup point after arriving at the bakery address.")}
              ${field("Business phone number", bakery.businessPhone, "The number drivers and partner organizations may call during business hours.")}
              ${field("Notification contact", bakery.notificationPhone, "The email address or phone number monitored for upcoming pickup confirmations and notifications.")}
              ${bakerySchedule.map((window, index) => field(`Pickup window ${index + 1}`, window.summary, `${window.readyDescription} ${window.deadlineDescription}`)).join("")}
            </table></div>` : ""}
            <p style="margin-top:28px;line-height:1.6">All of this information can be reviewed and adjusted in the partner portal after the account is connected. Access photos may also be added there to help drivers locate the ${pantry ? "pantry’s drop-off" : "bakery’s pickup"} point.</p>
            <p style="line-height:1.6">Thank you for joining BakedBoston. We’re excited to help strengthen connections among local businesses, food pantries, volunteers, and the wider community.</p>
            <p style="margin-bottom:0"><strong>BakedBoston</strong></p>
          </div>
        </div>
      </div>`,
    }),
  });
  return response.ok;
}

function describeBakerySchedule(bakery: typeof bakeries.$inferSelect) {
  try {
    const ready = JSON.parse(bakery.readyTime) as Record<string, string>;
    const deadlines = JSON.parse(bakery.arrivalDeadline) as Record<string, string>;
    return Object.keys(ready).map((day) => ({
      summary: `Every ${day}: ready ${formatTime(ready[day])}; pickup deadline ${formatTime(deadlines[day] ?? "")}`,
      readyDescription: `Food ready is when surplus from ${bakery.name} becomes available for collection.`,
      deadlineDescription: `Pickup deadline is the latest time a driver may collect it from ${bakery.name}.`,
    }));
  } catch {
    return [{
      summary: `${bakery.recurringDays}: ready ${formatTime(bakery.readyTime)}; pickup deadline ${formatTime(bakery.arrivalDeadline)}`,
      readyDescription: `Food ready is when surplus from ${bakery.name} becomes available for collection.`,
      deadlineDescription: `Pickup deadline is the latest time a driver may collect it from ${bakery.name}.`,
    }];
  }
}

function describePantrySchedule(pantry: typeof pantries.$inferSelect) {
  try {
    const opens = JSON.parse(pantry.openTime) as Array<{ recurrence: string; day: string; ordinal: number | null; time: string }>;
    const closes = JSON.parse(pantry.closeTime) as Array<{ time: string }>;
    const latest = JSON.parse(pantry.latestArrival) as Array<{ time: string }>;
    if (Array.isArray(opens)) return opens.map((window, index) => {
      const occurrence = window.recurrence === "monthly" ? `${ordinal(window.ordinal)} ${window.day} of each month` : `Every ${window.day}`;
      const close = closes[index]?.time ?? "";
      const last = latest[index]?.time ?? "";
      return {
        summary: `${occurrence}: ${formatTime(window.time)}–${formatTime(close)}; latest delivery ${formatTime(last)}`,
        openDescription: `Open is when ${pantry.name} begins accepting deliveries during this window.`,
        closeDescription: `Closed is when this receiving window ends.`,
        latestDescription: `Latest permitted arrival is the latest time a delivery can be dropped off at ${pantry.name}.`,
      };
    });
  } catch { /* Use the legacy fields below. */ }
  return [{
    summary: `${pantry.recurringDays}: ${formatTime(pantry.openTime)}–${formatTime(pantry.closeTime)}; latest delivery ${formatTime(pantry.latestArrival)}`,
    openDescription: `Open is when ${pantry.name} begins accepting deliveries.`,
    closeDescription: "Closed is when the receiving window ends.",
    latestDescription: `Latest permitted arrival is the latest time a delivery can be dropped off at ${pantry.name}.`,
  }];
}

function formatTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

function ordinal(value: number | null) {
  return ({ 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth" } as Record<number, string>)[value ?? 1] ?? "first";
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
