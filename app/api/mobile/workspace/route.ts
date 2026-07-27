import { createHash } from "crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  availabilityPauses,
  availabilityWindows,
  bakeries,
  mobileSessions,
  organizationContacts,
  pantries,
  partnerAccounts,
  rescueRoutes,
  scheduleExceptions,
} from "../../../../db/schema";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  if (!token) return Response.json({ error: "Sign in required." }, { status: 401 });

  const db = getDb();
  const [session] = await db.select().from(mobileSessions).where(and(
    eq(mobileSessions.tokenHash, tokenHash(token)),
    gt(mobileSessions.expiresAt, new Date()),
  )).limit(1);
  if (!session || session.role === "driver") return Response.json({ error: "Partner account required." }, { status: 401 });

  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, session.accountId)).limit(1);
  if (!account?.active || account.organizationType !== session.role) {
    return Response.json({ error: "Account unavailable." }, { status: 401 });
  }

  const organization = account.organizationType === "bakery"
    ? (await db.select().from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1))[0]
    : (await db.select().from(pantries).where(eq(pantries.id, account.organizationId)).limit(1))[0];
  if (!organization) return Response.json({ error: "Organization unavailable." }, { status: 404 });

  const [contacts, windows, pauses, exceptions, routes] = await Promise.all([
    db.select().from(organizationContacts).where(and(
      eq(organizationContacts.organizationType, account.organizationType),
      eq(organizationContacts.organizationId, account.organizationId),
    )),
    db.select().from(availabilityWindows).where(and(
      eq(availabilityWindows.organizationType, account.organizationType),
      eq(availabilityWindows.organizationId, account.organizationId),
    )).orderBy(desc(availabilityWindows.startsAt)),
    db.select().from(availabilityPauses).where(and(
      eq(availabilityPauses.organizationType, account.organizationType),
      eq(availabilityPauses.organizationId, account.organizationId),
    )).orderBy(desc(availabilityPauses.createdAt)),
    db.select().from(scheduleExceptions).where(and(
      eq(scheduleExceptions.organizationType, account.organizationType),
      eq(scheduleExceptions.organizationId, account.organizationId),
    )),
    account.organizationType === "bakery"
      ? db.select().from(rescueRoutes).where(eq(rescueRoutes.bakeryName, organization.name)).orderBy(desc(rescueRoutes.createdAt))
      : db.select().from(rescueRoutes).where(eq(rescueRoutes.pantryName, organization.name)).orderBy(desc(rescueRoutes.createdAt)),
  ]);

  return Response.json({
    account: {
      accountEmail: account.accountEmail,
      administratorName: account.administratorName,
      contactEmail: account.contactEmail,
      contactPhone: account.contactPhone,
    },
    organization,
    contacts,
    availabilityWindows: windows,
    availabilityPauses: pauses,
    scheduleExceptions: exceptions,
    routes,
  });
}
