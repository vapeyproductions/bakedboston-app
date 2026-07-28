import { createHash } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { driverAccounts, inAppNotifications, mobileSessions, partnerAccounts, pushDevices } from "../../../../db/schema";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function POST(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const db = getDb();
  const [session] = await db.select().from(mobileSessions).where(and(
    eq(mobileSessions.tokenHash, tokenHash(bearer)),
    gt(mobileSessions.expiresAt, new Date()),
  )).limit(1);
  if (!session) return Response.json({ error: "Session expired." }, { status: 401 });
  let recipientType: "driver" | "bakery" | "pantry";
  let recipientId: number;
  if (session.role === "driver") {
    const [driver] = await db.select().from(driverAccounts).where(and(
      eq(driverAccounts.id, session.accountId), eq(driverAccounts.active, true),
    )).limit(1);
    if (!driver) return Response.json({ error: "Driver account unavailable." }, { status: 404 });
    recipientType = "driver";
    recipientId = driver.id;
  } else {
    const [partner] = await db.select().from(partnerAccounts).where(and(
      eq(partnerAccounts.id, session.accountId),
      eq(partnerAccounts.active, true),
      eq(partnerAccounts.organizationType, session.role),
    )).limit(1);
    if (!partner) return Response.json({ error: "Partner account unavailable." }, { status: 404 });
    recipientType = session.role;
    recipientId = partner.organizationId;
  }
  const body = await request.json() as Record<string, unknown>;
  const expoPushToken = String(body.expoPushToken ?? "").trim();
  const platform = String(body.platform ?? "unknown").trim();
  if (!/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/.test(expoPushToken)) {
    return Response.json({ error: "A valid Expo push token is required." }, { status: 400 });
  }
  const [existing] = await db.select().from(pushDevices).where(eq(pushDevices.expoPushToken, expoPushToken)).limit(1);
  const newAssociation = !existing || existing.recipientType !== recipientType || existing.recipientId !== recipientId;
  const [device] = existing
    ? await db.update(pushDevices).set({
      recipientType, recipientId, platform, active: true, lastSeenAt: new Date(),
    }).where(eq(pushDevices.id, existing.id)).returning()
    : await db.insert(pushDevices).values({
      recipientType, recipientId, expoPushToken, platform,
    }).returning();
  if (newAssociation) await db.insert(inAppNotifications).values({
    recipientType,
    recipientId,
    eventType: "push_device_connected",
    title: "BakedBoston notifications are connected",
    body: `This test confirms that scheduled ${recipientType === "bakery" ? "pickup" : recipientType === "pantry" ? "delivery" : "route"} reminders can reach this iPhone while the app is in the background.`,
  });
  return Response.json({ device });
}
