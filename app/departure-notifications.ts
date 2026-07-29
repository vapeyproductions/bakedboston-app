import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { bakeries, bakeryPickupOccurrences, driverRideRequests, inAppNotifications, pantries, routeOffers } from "../db/schema";
import { trafficAwareDriveMinutes } from "./google-routes";
import { pantryAcceptsAt } from "./pickup-matching";

const formatTime = (date: Date) => date.toLocaleTimeString("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

export async function processDepartureNotifications(driverId?: number, driverLocation?: { latitude: number; longitude: number } | null) {
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
      if (sent) {
        const feasibility = await recalculateFeasibility(offer, driverLocation);
        await notify(offer.driverId, "departure_window_ended", "Recommended departure window ended",
          feasibility === "feasible"
            ? "Google traffic estimates show that this delivery can still work. Begin now to protect both organization deadlines."
            : feasibility === "infeasible"
              ? "Current Google traffic estimates indicate that the route no longer meets its deadlines. The reservation has been flagged and kept in place until automated release is enabled."
              : "You can still begin now. Live traffic could not be verified, so BakedBoston has kept your reservation rather than cancelling it.");
      }
      continue;
    }
    if (now >= closingReminderAt) {
      const sent = await markSent(offer.id, "departureClosingReminderSentAt", now);
      if (sent) {
        const feasibility = await recalculateFeasibility(offer, driverLocation);
        await notify(offer.driverId, "departure_window_closing", "Departure window ends soon",
          feasibility === "infeasible"
            ? "Traffic has changed and this route is at risk of missing its deadlines. Please begin now."
            : `Your recommended departure window ends in 5 minutes at ${formatTime(offer.departureWindowEndsAt)}. Begin now if you can.`);
      }
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

async function recalculateFeasibility(
  offer: typeof routeOffers.$inferSelect,
  driverLocation?: { latitude: number; longitude: number } | null,
) {
  if (!driverLocation) return "unavailable" as const;
  const db = getDb();
  const [[pickup], [request]] = await Promise.all([
    db.select().from(bakeryPickupOccurrences).where(eq(bakeryPickupOccurrences.id, offer.pickupOccurrenceId)).limit(1),
    db.select().from(driverRideRequests).where(eq(driverRideRequests.id, offer.driverRequestId)).limit(1),
  ]);
  if (!pickup || !request) return "unavailable" as const;
  const [[bakery], [pantry]] = await Promise.all([
    db.select().from(bakeries).where(eq(bakeries.id, pickup.bakeryId)).limit(1),
    db.select().from(pantries).where(eq(pantries.id, offer.pantryId)).limit(1),
  ]);
  if (!bakery || !pantry || bakery.latitude === null || bakery.longitude === null || pantry.latitude === null || pantry.longitude === null) {
    return "unavailable" as const;
  }
  const [toBakery, toPantry] = await Promise.all([
    trafficAwareDriveMinutes(driverLocation, { latitude: bakery.latitude, longitude: bakery.longitude }),
    trafficAwareDriveMinutes({ latitude: bakery.latitude, longitude: bakery.longitude }, { latitude: pantry.latitude, longitude: pantry.longitude }),
  ]);
  if (toBakery === null || toPantry === null) return "unavailable" as const;
  const bakeryArrival = new Date(Date.now() + toBakery * 60_000);
  const pantryArrival = new Date(bakeryArrival.getTime() + (15 + toPantry) * 60_000);
  const completion = new Date(pantryArrival.getTime() + 15 * 60_000);
  return bakeryArrival <= pickup.pickupDeadline && pantryAcceptsAt(pantry, pantryArrival) && completion <= request.latestFinish
    ? "feasible" as const
    : "infeasible" as const;
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
    actionRequired: false,
    actionKey: eventType,
  });
}
