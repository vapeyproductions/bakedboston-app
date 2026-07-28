import { createHash } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { driverAccounts, mobileSessions, pushDevices } from "../../../../db/schema";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function POST(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const db = getDb();
  const [session] = await db.select().from(mobileSessions).where(and(
    eq(mobileSessions.tokenHash, tokenHash(bearer)),
    gt(mobileSessions.expiresAt, new Date()),
    eq(mobileSessions.role, "driver"),
  )).limit(1);
  if (!session) return Response.json({ error: "Session expired." }, { status: 401 });
  const [driver] = await db.select().from(driverAccounts).where(and(
    eq(driverAccounts.id, session.accountId), eq(driverAccounts.active, true),
  )).limit(1);
  if (!driver) return Response.json({ error: "Driver account unavailable." }, { status: 404 });
  const body = await request.json() as Record<string, unknown>;
  const expoPushToken = String(body.expoPushToken ?? "").trim();
  const platform = String(body.platform ?? "unknown").trim();
  if (!/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/.test(expoPushToken)) {
    return Response.json({ error: "A valid Expo push token is required." }, { status: 400 });
  }
  const [existing] = await db.select().from(pushDevices).where(eq(pushDevices.expoPushToken, expoPushToken)).limit(1);
  const [device] = existing
    ? await db.update(pushDevices).set({
      recipientType: "driver", recipientId: driver.id, platform, active: true, lastSeenAt: new Date(),
    }).where(eq(pushDevices.id, existing.id)).returning()
    : await db.insert(pushDevices).values({
      recipientType: "driver", recipientId: driver.id, expoPushToken, platform,
    }).returning();
  return Response.json({ device });
}
