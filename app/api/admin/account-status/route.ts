import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { driverAccounts, organizationContacts, partnerAccounts } from "../../../../db/schema";
import { sendAccountStatusEmail } from "../../../account-email";
import { getAdministrator } from "../../../admin-auth";
import { writeAudit } from "../../../audit";

export async function PATCH(request: Request) {
  const actor = await getAdministrator();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const kind = String(body.kind);
  const id = Number(body.id);
  if (!Number.isInteger(id) || !["bakery", "pantry", "driver"].includes(kind)) return Response.json({ error: "Invalid account." }, { status: 400 });
  const db = getDb();
  if (kind === "driver") {
    const verificationStatus = typeof body.verificationStatus === "string" ? body.verificationStatus : "";
    if (verificationStatus) {
      if (!["pending", "verified", "needs_attention"].includes(verificationStatus)) {
        return Response.json({ error: "Invalid verification status." }, { status: 400 });
      }
      const [driver] = await db.update(driverAccounts)
        .set({ identityVerificationStatus: verificationStatus as "pending" | "verified" | "needs_attention" })
        .where(eq(driverAccounts.id, id))
        .returning();
      if (!driver) return Response.json({ error: "Driver not found." }, { status: 404 });
      await writeAudit({
        actorType: "admin",
        actorId: actor.id,
        actorName: actor.displayName,
        action: `changed driver verification to ${verificationStatus.replaceAll("_", " ")}`,
        entityType: "driver",
        entityId: driver.id,
        entityName: driver.displayName,
        details: driver.email,
      });
      return Response.json({ account: driver });
    }
    const active = Boolean(body.active);
    const [driver] = await db.update(driverAccounts).set({ active }).where(eq(driverAccounts.id, id)).returning();
    if (!driver) return Response.json({ error: "Driver not found." }, { status: 404 });
    const emailSent = await sendAccountStatusEmail({ to: [driver.email], recipientName: driver.displayName || driver.email, accountType: "driver", action: active ? "restored" : "disabled" });
    await writeAudit({ actorType: "admin", actorId: actor.id, actorName: actor.displayName, action: `${active ? "restored" : "temporarily disabled"} driver account`, entityType: "driver", entityId: driver.id, entityName: driver.displayName, details: driver.email });
    return Response.json({ account: driver, emailSent });
  }
  const active = Boolean(body.active);
  const [account] = await db.update(partnerAccounts).set({ active, updatedAt: new Date() }).where(and(
    eq(partnerAccounts.organizationType, kind as "bakery" | "pantry"),
    eq(partnerAccounts.organizationId, id),
  )).returning();
  if (!account) return Response.json({ error: "Organization account not found." }, { status: 404 });
  const contacts = await db.select({ email: organizationContacts.email }).from(organizationContacts).where(and(
    eq(organizationContacts.organizationType, kind as "bakery" | "pantry"),
    eq(organizationContacts.organizationId, id),
    eq(organizationContacts.isPrimary, true),
  ));
  const emailSent = await sendAccountStatusEmail({ to: [account.accountEmail, ...contacts.map((contact) => contact.email)], recipientName: account.administratorName || account.accountEmail, accountType: kind as "bakery" | "pantry", action: active ? "restored" : "disabled" });
  await writeAudit({ actorType: "admin", actorId: actor.id, actorName: actor.displayName, action: `${active ? "restored" : "temporarily disabled"} ${kind} account`, entityType: kind, entityId: id, entityName: account.administratorName, details: account.accountEmail });
  return Response.json({ account, emailSent });
}
