import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { bakeries, bakeryPickupOccurrences, inAppNotifications, routeOffers } from "../db/schema";
import { replaceOperationalNotification } from "./operational-notifications";

type ReminderField = "readyReminder30SentAt" | "readyReminder25SentAt" | "readyReminder20SentAt" | "readyReminder15SentAt";

export async function processPickupReadinessReminders() {
  const db = getDb();
  const now = new Date();
  const offers = await db.select().from(routeOffers).where(and(
    eq(routeOffers.status, "accepted"),
    isNull(routeOffers.pickupReadyAt),
  ));
  for (const offer of offers) {
    if (!["reserved", "en_route_to_bakery", "arrived_at_bakery"].includes(offer.deliveryStage)) continue;
    const minutesUntilArrival = (offer.estimatedBakeryArrival.getTime() - now.getTime()) / 60_000;
    const reminder = reminderFor(minutesUntilArrival, offer);
    if (!reminder) continue;
    const [marked] = await db.update(routeOffers).set({ [reminder.field]: now }).where(and(
      eq(routeOffers.id, offer.id), isNull(routeOffers[reminder.field]), isNull(routeOffers.pickupReadyAt),
    )).returning({ id: routeOffers.id });
    if (!marked) continue;
    const [pickup] = await db.select().from(bakeryPickupOccurrences).where(eq(bakeryPickupOccurrences.id, offer.pickupOccurrenceId)).limit(1);
    if (!pickup) continue;
    const [bakery] = await db.select().from(bakeries).where(eq(bakeries.id, pickup.bakeryId)).limit(1);
    if (!bakery) continue;
    await replaceOperationalNotification({
      recipientType: "bakery",
      recipientId: bakery.id,
      eventType: "pickup_readiness_reminder",
      threadKey: `pickup:${pickup.id}`,
      title: "Is the food ready for pickup?",
      body: `${offer.estimatedBakeryArrival.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} is the current driver ETA. Confirm as soon as the food is packaged and ready.`,
      actionRequired: true,
      actionKey: `pickup-ready:${offer.id}`,
    });
  }
}

function reminderFor(minutes: number, offer: typeof routeOffers.$inferSelect): { field: ReminderField } | null {
  if (minutes <= 15) return !offer.readyReminder15SentAt ? { field: "readyReminder15SentAt" } : null;
  if (minutes <= 20) return !offer.readyReminder20SentAt ? { field: "readyReminder20SentAt" } : null;
  if (minutes <= 25) return !offer.readyReminder25SentAt ? { field: "readyReminder25SentAt" } : null;
  if (minutes <= 30) return !offer.readyReminder30SentAt ? { field: "readyReminder30SentAt" } : null;
  return null;
}

export async function markPickupReady(bakeryId: number, offerId: number) {
  const db = getDb();
  const [offer] = await db.select().from(routeOffers).where(and(
    eq(routeOffers.id, offerId), eq(routeOffers.status, "accepted"),
  )).limit(1);
  if (!offer) return null;
  const [pickup] = await db.select().from(bakeryPickupOccurrences).where(and(
    eq(bakeryPickupOccurrences.id, offer.pickupOccurrenceId),
    eq(bakeryPickupOccurrences.bakeryId, bakeryId),
  )).limit(1);
  if (!pickup) return null;
  const now = new Date();
  const [updated] = await db.update(routeOffers).set({ pickupReadyAt: now }).where(eq(routeOffers.id, offer.id)).returning();
  await db.update(inAppNotifications).set({
    readAt: now,
    acknowledgedAt: now,
  }).where(and(
    eq(inAppNotifications.recipientType, "bakery"),
    eq(inAppNotifications.recipientId, bakeryId),
    eq(inAppNotifications.actionKey, `pickup-ready:${offer.id}`),
  ));
  const driverTraveling = ["en_route_to_bakery", "arrived_at_bakery"].includes(offer.deliveryStage);
  await Promise.all([
    db.insert(inAppNotifications).values({
      recipientType: "driver",
      recipientId: offer.driverId,
      eventType: "pickup_ready",
      title: "Your pickup is ready",
      body: "The bakery confirmed that the food is packaged and ready for pickup.",
    }),
    replaceOperationalNotification({
      recipientType: "bakery",
      recipientId: bakeryId,
      eventType: driverTraveling ? "pickup_ready_driver_en_route" : "pickup_ready",
      threadKey: `pickup:${pickup.id}`,
      title: driverTraveling ? "Food is ready and the driver is on the way" : "Food is ready — pickup reserved",
      body: driverTraveling
        ? `The food is ready, and the driver is traveling to the bakery. Current estimated arrival: ${offer.estimatedBakeryArrival.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}.`
        : `The food is packaged and ready. ${offer.estimatedBakeryArrival.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} is the driver's estimated bakery arrival; this update will change to “Driver is on the way” when they begin the delivery.`,
      actionRequired: false,
      actionKey: "",
    }),
  ]);
  return updated;
}
