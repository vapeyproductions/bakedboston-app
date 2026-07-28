import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { inAppNotifications, routeOffers } from "../db/schema";

const formatTime = (date: Date) => date.toLocaleTimeString("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

export async function processDepartureNotifications(driverId?: number) {
  const db = getDb();
  const now = new Date();
  const offers = await db.select().from(routeOffers).where(and(
    eq(routeOffers.status, "accepted"),
    eq(routeOffers.deliveryStage, "reserved"),
    ...(driverId ? [eq(routeOffers.driverId, driverId)] : []),
  ));

  for (const offer of offers) {
    if (!offer.departureWindowStartsAt || !offer.departureWindowEndsAt) continue;
    const openingReminderAt = new Date(offer.departureWindowStartsAt.getTime() - 5 * 60_000);
    const closingReminderAt = new Date(offer.departureWindowEndsAt.getTime() - 5 * 60_000);
    // Only send the most current message if polling resumes after multiple
    // thresholds have already passed; do not flood the driver with stale alerts.
    if (now >= offer.departureWindowEndsAt) {
      const sent = await markSent(offer.id, "departureEndedNotificationSentAt", now);
      if (sent) await notify(offer.driverId, "departure_window_ended", "Recommended departure window ended",
        "The original departure window has ended. You can still begin now; BakedBoston will recheck traffic and both organization deadlines before cancelling the route.");
      continue;
    }
    if (now >= closingReminderAt) {
      const sent = await markSent(offer.id, "departureClosingReminderSentAt", now);
      if (sent) await notify(offer.driverId, "departure_window_closing", "Departure window ends soon",
        `Your recommended departure window ends in 5 minutes at ${formatTime(offer.departureWindowEndsAt)}. Begin now if you can.`);
      continue;
    }
    if (now >= offer.departureWindowStartsAt) {
      const sent = await markSent(offer.id, "departureOpenedNotificationSentAt", now);
      if (sent) await notify(offer.driverId, "departure_window_open", "You can begin your delivery",
        `Your recommended departure window is open. Try to leave by ${formatTime(offer.departureWindowEndsAt)}.`);
      continue;
    }
    if (now >= openingReminderAt) {
      const sent = await markSent(offer.id, "departureOpeningReminderSentAt", now);
      if (sent) await notify(offer.driverId, "departure_window_soon", "Departure window begins soon",
        `Your recommended departure window begins in 5 minutes. Plan to leave between ${formatTime(offer.departureWindowStartsAt)} and ${formatTime(offer.departureWindowEndsAt)}.`);
    }
  }
}

type ReminderField =
  | "departureOpeningReminderSentAt"
  | "departureOpenedNotificationSentAt"
  | "departureClosingReminderSentAt"
  | "departureEndedNotificationSentAt";

async function markSent(id: number, field: ReminderField, now: Date) {
  const db = getDb();
  const [updated] = await db.update(routeOffers).set({ [field]: now }).where(and(
    eq(routeOffers.id, id),
    isNull(routeOffers[field]),
  )).returning({ id: routeOffers.id });
  return Boolean(updated);
}

async function notify(driverId: number, eventType: string, title: string, body: string) {
  await getDb().insert(inAppNotifications).values({
    recipientType: "driver",
    recipientId: driverId,
    eventType,
    title,
    body,
    actionRequired: true,
    actionKey: eventType,
  });
}
