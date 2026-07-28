import { createHash } from "crypto";
import { and, eq, gt, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { driverAccounts, driverRideRequests, inAppNotifications, mobileSessions, pushDevices, routeOffers, supportReports } from "../../../../db/schema";
import { sendAccountStatusEmail } from "../../../account-email";
import { writeAudit } from "../../../audit";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const bearer = (request: Request) => request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";

async function currentDriver(request: Request) {
  const db = getDb();
  const token = bearer(request);
  const [session] = await db.select().from(mobileSessions).where(and(eq(mobileSessions.tokenHash, tokenHash(token)), gt(mobileSessions.expiresAt, new Date()), eq(mobileSessions.role, "driver"))).limit(1);
  if (!session) return null;
  const [driver] = await db.select().from(driverAccounts).where(eq(driverAccounts.id, session.accountId)).limit(1);
  return driver?.active ? driver : null;
}

export async function GET(request: Request) {
  const driver = await currentDriver(request);
  if (!driver) return Response.json({ error: "Session expired." }, { status: 401 });
  return Response.json({ driver: publicDriver(driver) });
}

export async function PATCH(request: Request) {
  try {
    const driver = await currentDriver(request);
    if (!driver) return Response.json({ error: "Session expired." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const homeAddress = String(body.homeAddress ?? "").trim();
    const homeZip = String(body.homeZip ?? "").trim();
    if (!displayName || !phone || !homeAddress || !/^\d{5}$/.test(homeZip) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Enter a valid name, email, phone number, home address, and five-digit ZIP code.");
    }
    const db = getDb();
    const [duplicate] = await db.select({ id: driverAccounts.id }).from(driverAccounts).where(and(eq(driverAccounts.email, email), ne(driverAccounts.id, driver.id))).limit(1);
    if (duplicate) throw new Error("Another driver account already uses this email.");
    const [updated] = await db.update(driverAccounts).set({ email, displayName, phone, homeAddress, homeZip }).where(eq(driverAccounts.id, driver.id)).returning();
    return Response.json({ driver: publicDriver(updated) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update profile." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const driver = await currentDriver(request);
    if (!driver) return Response.json({ error: "Session expired." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.confirm !== true) return Response.json({ error: "Account deletion must be confirmed." }, { status: 400 });
    const db = getDb();
    await db.delete(routeOffers).where(eq(routeOffers.driverId, driver.id));
    await db.delete(driverRideRequests).where(eq(driverRideRequests.driverId, driver.id));
    await db.delete(mobileSessions).where(and(eq(mobileSessions.role, "driver"), eq(mobileSessions.accountId, driver.id)));
    await db.delete(inAppNotifications).where(and(eq(inAppNotifications.recipientType, "driver"), eq(inAppNotifications.recipientId, driver.id)));
    await db.delete(pushDevices).where(and(eq(pushDevices.recipientType, "driver"), eq(pushDevices.recipientId, driver.id)));
    await db.delete(supportReports).where(and(eq(supportReports.reporterType, "driver"), eq(supportReports.reporterId, driver.id)));
    await db.delete(driverAccounts).where(eq(driverAccounts.id, driver.id));
    await sendAccountStatusEmail({ to: [driver.email], recipientName: driver.displayName || driver.email, accountType: "driver", action: "deleted" }).catch(() => undefined);
    await writeAudit({ actorType: "system", actorName: driver.displayName || driver.email, action: "driver deleted own account", entityType: "driver", entityId: driver.id, entityName: driver.displayName, details: driver.email });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not delete this account." }, { status: 400 });
  }
}

function publicDriver(driver: typeof driverAccounts.$inferSelect) {
  return {
    id: driver.id,
    email: driver.email,
    displayName: driver.displayName,
    phone: driver.phone,
    homeAddress: driver.homeAddress,
    homeZip: driver.homeZip,
    dateOfBirth: driver.dateOfBirth,
    verificationStatus: driver.identityVerificationStatus,
  };
}
