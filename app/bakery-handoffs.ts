import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { bakeries, bakeryPickupOccurrences, inAppNotifications, routeOffers } from "../db/schema";
import { replaceOperationalNotification } from "./operational-notifications";

export async function recordBakeryHandoff(bakeryId: number, offerId: number, pickedUp: boolean) {
  const db = getDb();
  const [offer] = await db.select().from(routeOffers).where(and(
    eq(routeOffers.id, offerId),
    eq(routeOffers.status, "accepted"),
  )).limit(1);
  if (!offer?.arrivedAtBakeryAt) return { error: "The driver has not confirmed arrival at the bakery.", status: 409 };
  if (pickedUp && !["picked_up", "en_route_to_pantry", "arrived_at_pantry", "completed"].includes(offer.deliveryStage)) {
    return { error: "Wait until the driver confirms that the food was picked up.", status: 409 };
  }
  const [pickup] = await db.select().from(bakeryPickupOccurrences).where(and(
    eq(bakeryPickupOccurrences.id, offer.pickupOccurrenceId),
    eq(bakeryPickupOccurrences.bakeryId, bakeryId),
  )).limit(1);
  if (!pickup) return { error: "Pickup not found.", status: 404 };
  if (!pickedUp && Date.now() - offer.arrivedAtBakeryAt.getTime() < 15 * 60_000) {
    return { error: "The not-picked-up option becomes available 15 minutes after the driver arrives.", status: 409 };
  }
  const now = new Date();
  const [updated] = await db.update(routeOffers).set(pickedUp
    ? { bakeryHandoffConfirmedAt: now, bakeryHandoffDisputedAt: null }
    : { bakeryHandoffDisputedAt: now, bakeryHandoffConfirmedAt: null })
    .where(eq(routeOffers.id, offer.id)).returning();
  await db.update(inAppNotifications).set({ readAt: now, acknowledgedAt: now }).where(and(
    eq(inAppNotifications.recipientType, "bakery"),
    eq(inAppNotifications.recipientId, bakeryId),
    eq(inAppNotifications.threadKey, `pickup:${pickup.id}`),
  ));
  if (!pickedUp) {
    await db.insert(inAppNotifications).values([
      {
        recipientType: "admin",
        recipientId: 0,
        eventType: "pickup_handoff_disputed",
        title: "Bakery reported food was not picked up",
        body: `Bakery ${bakeryId} disputed pickup ${pickup.id} after the driver arrived.`,
      },
      {
        recipientType: "driver",
        recipientId: offer.driverId,
        eventType: "pickup_handoff_disputed",
        title: "Bakery reported a pickup issue",
        body: "The bakery reported that the food was not picked up. BakedBoston administrators can review the handoff.",
      },
    ]);
  }
  return { offer: updated };
}

export async function processOverdueBakeryHandoffs() {
  const db = getDb();
  const nowBoston = bostonDate(new Date());
  const offers = await db.select().from(routeOffers).where(and(
    eq(routeOffers.status, "accepted"),
    isNotNull(routeOffers.arrivedAtBakeryAt),
    isNull(routeOffers.bakeryHandoffConfirmedAt),
    isNull(routeOffers.bakeryHandoffDisputedAt),
  ));
  for (const offer of offers) {
    if (!offer.arrivedAtBakeryAt || bostonDate(offer.arrivedAtBakeryAt) >= nowBoston) continue;
    const [pickup] = await db.select().from(bakeryPickupOccurrences).where(eq(bakeryPickupOccurrences.id, offer.pickupOccurrenceId)).limit(1);
    if (!pickup) continue;
    const [bakery] = await db.select().from(bakeries).where(eq(bakeries.id, pickup.bakeryId)).limit(1);
    if (!bakery) continue;
    const [existingFollowup] = await db.select({ id: inAppNotifications.id }).from(inAppNotifications).where(and(
      eq(inAppNotifications.recipientType, "bakery"),
      eq(inAppNotifications.recipientId, bakery.id),
      eq(inAppNotifications.threadKey, `pickup:${pickup.id}`),
      eq(inAppNotifications.eventType, "pickup_handoff_followup"),
    )).limit(1);
    if (existingFollowup) continue;
    await replaceOperationalNotification({
      recipientType: "bakery",
      recipientId: bakery.id,
      eventType: "pickup_handoff_followup",
      threadKey: `pickup:${pickup.id}`,
      title: "Please confirm yesterday’s pickup",
      body: "The driver recorded the food as picked up, but the bakery has not confirmed the handoff. Please confirm whether the food was collected.",
      actionRequired: true,
      actionKey: `confirm-handoff:${offer.id}:${offer.arrivedAtBakeryAt.getTime()}`,
    });
  }
}

function bostonDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
}
