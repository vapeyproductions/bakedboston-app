import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, pantries, partnerAccounts } from "../../../../db/schema";
import { getPartnerAccountId } from "../../../partner-auth";
import { writeAudit } from "../../../audit";

export async function PATCH(request: Request) {
  const accountId = await getPartnerAccountId();
  if (!accountId) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const accountEmail = requiredEmail(body.accountEmail, "Account email");
    const businessPhone = clean(body.businessPhone);
    const notificationPhone = clean(body.notificationPhone);
    const address = required(body.address, "Address");
    const dropoffInstructions = clean(body.dropoffInstructions);
    const db = getDb();

    const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
    if (!account) return Response.json({ error: "Account not found." }, { status: 404 });
    const [duplicate] = await db.select({ id: partnerAccounts.id }).from(partnerAccounts)
      .where(and(eq(partnerAccounts.accountEmail, accountEmail), ne(partnerAccounts.id, accountId))).limit(1);
    if (duplicate) return Response.json({ error: "That account email is already in use." }, { status: 409 });

    await db.update(partnerAccounts).set({
      accountEmail,
      updatedAt: new Date(),
    }).where(eq(partnerAccounts.id, accountId));

    const organizationUpdate = { address, businessPhone, notificationPhone };
    if (account.organizationType === "bakery") {
      await db.update(bakeries).set({ ...organizationUpdate, dropoffInstructions }).where(eq(bakeries.id, account.organizationId));
    } else {
      await db.update(pantries).set({ ...organizationUpdate, dropoffInstructions }).where(eq(pantries.id, account.organizationId));
    }
    await writeAudit({
      actorType: "partner", actorId: account.id, actorName: account.administratorName,
      action: "updated organization profile", entityType: account.organizationType,
      entityId: account.organizationId, entityName: account.administratorName,
      details: "Account email, address, directions, or organization phone channels updated",
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save profile." }, { status: 400 });
  }
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function required(value: unknown, label: string) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function requiredEmail(value: unknown, label: string) {
  const email = required(value, label).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${label} is invalid.`);
  return email;
}
