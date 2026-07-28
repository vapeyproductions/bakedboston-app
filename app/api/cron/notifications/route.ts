import { eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { driverAccounts, inAppNotifications, pushDevices } from "../../../../db/schema";
import { processDepartureNotifications } from "../../../departure-notifications";
import { processDriverConfirmations } from "../../mobile/driver/requests/route";
import { processPickupReadinessReminders } from "../../../pickup-readiness";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const forwardedSecret = request.headers.get("x-bakedboston-cron-secret");
  const authenticated = Boolean(process.env.CRON_SECRET)
    && (authorization === `Bearer ${process.env.CRON_SECRET}` || forwardedSecret === process.env.CRON_SECRET);
  if (!authenticated) {
    return Response.json({
      error: "Unauthorized.",
      diagnostics: {
        secretConfigured: Boolean(process.env.CRON_SECRET),
        configuredLength: process.env.CRON_SECRET?.length ?? 0,
        authorizationReceived: Boolean(authorization),
        authorizationLength: authorization?.length ?? 0,
        bearerPrefixPresent: authorization?.startsWith("Bearer ") ?? false,
        dedicatedHeaderReceived: Boolean(forwardedSecret),
        dedicatedHeaderLength: forwardedSecret?.length ?? 0,
      },
    }, { status: 401 });
  }
  const db = getDb();
  const drivers = await db.select().from(driverAccounts).where(eq(driverAccounts.active, true));
  for (const driver of drivers) {
    await processDriverConfirmations(driver);
    const recentLocation = driver.lastLocationAt && Date.now() - driver.lastLocationAt.getTime() < 30 * 60_000;
    await processDepartureNotifications(driver.id, recentLocation && driver.lastLatitude !== null && driver.lastLongitude !== null
      ? { latitude: driver.lastLatitude, longitude: driver.lastLongitude }
      : null);
  }
  await processPickupReadinessReminders();

  const pending = await db.select().from(inAppNotifications).where(isNull(inAppNotifications.pushSentAt));
  const devices = await db.select().from(pushDevices).where(eq(pushDevices.active, true));
  let delivered = 0;
  for (const notification of pending) {
    const targets = devices.filter((device) =>
      device.recipientType === notification.recipientType && device.recipientId === notification.recipientId);
    if (!targets.length) continue;
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(targets.map((device) => ({
        to: device.expoPushToken,
        sound: "default",
        title: notification.title,
        body: notification.body,
        data: { notificationId: notification.id, actionKey: notification.actionKey },
      }))),
    });
    if (response.ok) {
      await db.update(inAppNotifications).set({ pushSentAt: new Date() }).where(eq(inAppNotifications.id, notification.id));
      delivered += targets.length;
    }
  }
  return Response.json({ checkedDrivers: drivers.length, delivered });
}
