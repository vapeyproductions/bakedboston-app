import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, pantries, partnerAccounts } from "../../../../db/schema";
import { getPartnerAccountId, hashPartnerPassword } from "../../../partner-auth";

export async function PATCH(request: Request) {
  const accountId = await getPartnerAccountId();
  if (!accountId) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const accountEmail = requiredEmail(body.accountEmail, "Account email");
    const administratorName = required(body.administratorName, "Administrator name");
    const contactEmail = requiredEmail(body.contactEmail, "Contact email");
    const contactPhone = required(body.contactPhone, "Contact phone");
    const businessPhone = clean(body.businessPhone);
    const notificationPhone = clean(body.notificationPhone);
    const newPassword = clean(body.newPassword);
    const db = getDb();

    const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
    if (!account) return Response.json({ error: "Account not found." }, { status: 404 });
    const [duplicate] = await db.select({ id: partnerAccounts.id }).from(partnerAccounts)
      .where(and(eq(partnerAccounts.accountEmail, accountEmail), ne(partnerAccounts.id, accountId))).limit(1);
    if (duplicate) return Response.json({ error: "That account email is already in use." }, { status: 409 });

    await db.update(partnerAccounts).set({
      accountEmail, administratorName, contactEmail, contactPhone,
      ...(newPassword ? { passwordHash: hashPartnerPassword(newPassword) } : {}),
      updatedAt: new Date(),
    }).where(eq(partnerAccounts.id, accountId));

    const organizationUpdate = { businessPhone, notificationPhone };
    if (account.organizationType === "bakery") {
      await db.update(bakeries).set(organizationUpdate).where(eq(bakeries.id, account.organizationId));
    } else {
      await db.update(pantries).set(organizationUpdate).where(eq(pantries.id, account.organizationId));
    }
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
