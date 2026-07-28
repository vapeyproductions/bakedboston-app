import { createHash } from "crypto";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "../../../../../db";
import {
  bakeries,
  bakeryAccessPhotos,
  bakeryPickupOccurrences,
  driverAccounts,
  driverRideRequests,
  inAppNotifications,
  mobileSessions,
  pantries,
  pantryAccessPhotos,
  rescueRoutes,
  routeOffers,
} from "../../../../../db/schema";
import { matchConfirmedPickup } from "../../../../pickup-matching";
import { processDepartureNotifications } from "../../../../departure-notifications";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

async function currentDriver(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  if (!token) return null;
  const db = getDb();
  const [session] = await db.select().from(mobileSessions).where(and(
    eq(mobileSessions.tokenHash, tokenHash(token)),
    gt(mobileSessions.expiresAt, new Date()),
    eq(mobileSessions.role, "driver"),
  )).limit(1);
  if (!session) return null;
  const [driver] = await db.select().from(driverAccounts).where(and(
    eq(driverAccounts.id, session.accountId),
    eq(driverAccounts.active, true),
  )).limit(1);
  return driver ?? null;
}

export async function GET(request: Request) {
  const driver = await currentDriver(request);
  if (!driver) return Response.json({ error: "Session expired." }, { status: 401 });
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("latitude"));
  const longitude = Number(url.searchParams.get("longitude"));
  const driverLocation = Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
  if (driverLocation) await getDb().update(driverAccounts).set({
    lastLatitude: driverLocation.latitude,
    lastLongitude: driverLocation.longitude,
    lastLocationAt: new Date(),
  }).where(eq(driverAccounts.id, driver.id));
  await expireAndAdvanceOffers();
  await processDriverConfirmations(driver);
  await processDepartureNotifications(driver.id, driverLocation);
  const db = getDb();
  const [requests, offers, notifications] = await Promise.all([
    db.select().from(driverRideRequests).where(eq(driverRideRequests.driverId, driver.id)).orderBy(desc(driverRideRequests.createdAt)),
    db.select().from(routeOffers).where(eq(routeOffers.driverId, driver.id)).orderBy(desc(routeOffers.createdAt)),
    db.select().from(inAppNotifications).where(and(
      eq(inAppNotifications.recipientType, "driver"),
      eq(inAppNotifications.recipientId, driver.id),
    )).orderBy(desc(inAppNotifications.createdAt)),
  ]);
  const pickupIds = [...new Set(offers.map((offer) => offer.pickupOccurrenceId))];
  const pantryIds = [...new Set(offers.map((offer) => offer.pantryId))];
  const pickups = (await Promise.all(pickupIds.map(async (id) =>
    (await db.select().from(bakeryPickupOccurrences).where(eq(bakeryPickupOccurrences.id, id)).limit(1))[0],
  ))).filter(Boolean);
  const bakeryIds = [...new Set(pickups.map((pickup) => pickup.bakeryId))];
  const bakeryRows = (await Promise.all(bakeryIds.map(async (id) =>
    (await db.select({ id: bakeries.id, name: bakeries.name, address: bakeries.address, dropoffInstructions: bakeries.dropoffInstructions }).from(bakeries).where(eq(bakeries.id, id)).limit(1))[0],
  ))).filter(Boolean);
  const pantryRows = (await Promise.all(pantryIds.map(async (id) =>
    (await db.select({ id: pantries.id, name: pantries.name, address: pantries.address, dropoffInstructions: pantries.dropoffInstructions }).from(pantries).where(eq(pantries.id, id)).limit(1))[0],
  ))).filter(Boolean);
  const [bakeryPhotos, pantryPhotos] = await Promise.all([
    bakeryIds.length ? db.select().from(bakeryAccessPhotos) : Promise.resolve([]),
    pantryIds.length ? db.select().from(pantryAccessPhotos) : Promise.resolve([]),
  ]);

  return Response.json({
    requests,
    offers: offers.map((offer) => {
      const pickup = pickups.find((item) => item.id === offer.pickupOccurrenceId);
      return {
        ...offer,
        pickup,
        bakery: (() => {
          const bakery = bakeryRows.find((item) => item.id === pickup?.bakeryId);
          return bakery ? {
            ...bakery,
            address: offer.status === "accepted" ? bakery.address : "",
            dropoffInstructions: offer.status === "accepted" ? bakery.dropoffInstructions : "",
            photos: offer.status === "accepted" ? bakeryPhotos.filter((photo) => photo.bakeryId === bakery.id).map((photo) => ({ id: photo.id, imageUrl: photo.imageUrl, caption: photo.caption })) : [],
          } : null;
        })(),
        pantry: (() => {
          const pantry = pantryRows.find((item) => item.id === offer.pantryId);
          return pantry ? {
            ...pantry,
            address: offer.status === "accepted" ? pantry.address : "",
            dropoffInstructions: offer.status === "accepted" ? pantry.dropoffInstructions : "",
            photos: offer.status === "accepted" ? pantryPhotos.filter((photo) => photo.pantryId === pantry.id).map((photo) => ({ id: photo.id, imageUrl: photo.imageUrl, caption: photo.caption })) : [],
          } : null;
        })(),
      };
    }),
    notifications,
  });
}

export async function POST(request: Request) {
  const driver = await currentDriver(request);
  if (!driver) return Response.json({ error: "Session expired." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const serviceDate = validDate(body.serviceDate);
    const earliestStart = validDateTime(body.earliestStart, "Earliest start");
    const latestFinish = validDateTime(body.latestFinish, "Latest finish");
    if (latestFinish <= earliestStart) throw new Error("Latest finish must be after the earliest start.");
    const startZip = optionalZip(body.startZip, "Starting ZIP");
    const endZip = optionalZip(body.endZip, "Destination ZIP");
    const maximumExtraMinutes = body.maximumExtraMinutes === null || body.maximumExtraMinutes === undefined || body.maximumExtraMinutes === ""
      ? null : Number(body.maximumExtraMinutes);
    if (maximumExtraMinutes !== null && (!Number.isInteger(maximumExtraMinutes) || maximumExtraMinutes < 0 || maximumExtraMinutes > 240)) {
      throw new Error("Maximum extra driving time must be between 0 and 240 minutes.");
    }
    const [record] = await getDb().insert(driverRideRequests).values({
      driverId: driver.id, serviceDate, earliestStart, latestFinish,
      startZip, endZip, maximumExtraMinutes,
    }).returning();
    const confirmedPickups = await getDb().select().from(bakeryPickupOccurrences).where(and(
      eq(bakeryPickupOccurrences.serviceDate, serviceDate),
      eq(bakeryPickupOccurrences.status, "confirmed"),
    ));
    for (const pickup of confirmedPickups) {
      const [bakery] = await getDb().select().from(bakeries).where(eq(bakeries.id, pickup.bakeryId)).limit(1);
      if (bakery) await matchConfirmedPickup(pickup, bakery.name, bakery.latitude, bakery.longitude);
    }
    return Response.json({ request: record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save this ride request." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const driver = await currentDriver(request);
  if (!driver) return Response.json({ error: "Session expired." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "accept-offer") return acceptOffer(driver, Number(body.offerId));
    if (action === "decline-offer") return declineOffer(driver.id, Number(body.offerId));
    if (action === "route-progress") return progressRoute(driver, Number(body.offerId), String(body.stage ?? ""));
    if (action === "cancel-route") return cancelRoute(driver, Number(body.offerId));
    if (action === "confirm-route") return confirmRoute(driver.id, Number(body.offerId));
    const id = Number(body.id);
    const status = String(body.status ?? "");
    if (!Number.isInteger(id) || !["active", "paused", "cancelled"].includes(status)) throw new Error("Choose a valid ride-request action.");
    const [record] = await getDb().update(driverRideRequests).set({
      status: status as "active" | "paused" | "cancelled",
      updatedAt: new Date(),
    }).where(and(eq(driverRideRequests.id, id), eq(driverRideRequests.driverId, driver.id))).returning();
    if (!record) return Response.json({ error: "Ride request not found." }, { status: 404 });
    return Response.json({ request: record });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update this ride request." }, { status: 400 });
  }
}

async function confirmRoute(driverId: number, offerId: number) {
  const now = new Date();
  const [confirmed] = await getDb().update(routeOffers).set({ driverConfirmedAt: now }).where(and(
    eq(routeOffers.id, offerId),
    eq(routeOffers.driverId, driverId),
    eq(routeOffers.status, "accepted"),
    eq(routeOffers.deliveryStage, "reserved"),
  )).returning();
  if (!confirmed) return Response.json({ error: "This route is no longer awaiting confirmation." }, { status: 409 });
  await getDb().insert(inAppNotifications).values({
    recipientType: "driver", recipientId: driverId, eventType: "route_reconfirmed",
    title: "Delivery confirmed", body: "Your reservation remains active. We’ll remind you when the recommended departure window approaches.",
  });
  return Response.json({ offer: confirmed });
}

export async function processDriverConfirmations(driver: typeof driverAccounts.$inferSelect) {
  const db = getDb();
  const now = new Date();
  const offers = await db.select().from(routeOffers).where(and(
    eq(routeOffers.driverId, driver.id),
    eq(routeOffers.status, "accepted"),
    eq(routeOffers.deliveryStage, "reserved"),
  ));
  for (const offer of offers) {
    if (!offer.driverConfirmationDueAt || !offer.driverConfirmationDeadlineAt || offer.driverConfirmedAt) continue;
    if (now >= offer.driverConfirmationDeadlineAt) {
      await cancelRoute(driver, offer.id, true);
      continue;
    }
    if (now >= offer.driverConfirmationDueAt && !offer.driverConfirmationRequestedAt) {
      const [requested] = await db.update(routeOffers).set({ driverConfirmationRequestedAt: now }).where(and(
        eq(routeOffers.id, offer.id), eq(routeOffers.status, "accepted"),
      )).returning();
      if (requested) await db.insert(inAppNotifications).values({
        recipientType: "driver", recipientId: driver.id, eventType: "route_confirmation_required",
        title: "Confirm your upcoming delivery",
        body: `Please confirm within 15 minutes to keep this reservation. Confirmation closes at ${offer.driverConfirmationDeadlineAt.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}.`,
        actionRequired: true, actionKey: `confirm-route:${offer.id}`,
      });
    }
  }
}

async function cancelRoute(driver: typeof driverAccounts.$inferSelect, offerId: number, missedConfirmation = false) {
  const db = getDb();
  const [offer] = await db.select().from(routeOffers).where(and(
    eq(routeOffers.id, offerId),
    eq(routeOffers.driverId, driver.id),
    eq(routeOffers.status, "accepted"),
  )).limit(1);
  if (!offer) return Response.json({ error: "Active route not found." }, { status: 404 });
  if (["picked_up", "en_route_to_pantry", "arrived_at_pantry", "completed"].includes(offer.deliveryStage)) {
    return Response.json({ error: "This delivery can no longer be cancelled because the food has been picked up." }, { status: 409 });
  }

  const [pickup] = await db.select().from(bakeryPickupOccurrences)
    .where(eq(bakeryPickupOccurrences.id, offer.pickupOccurrenceId)).limit(1);
  if (!pickup) return Response.json({ error: "Pickup occurrence not found." }, { status: 404 });
  const [[bakery], [pantry]] = await Promise.all([
    db.select().from(bakeries).where(eq(bakeries.id, pickup.bakeryId)).limit(1),
    db.select().from(pantries).where(eq(pantries.id, offer.pantryId)).limit(1),
  ]);
  if (!bakery || !pantry) return Response.json({ error: "Route organizations are unavailable." }, { status: 409 });

  const now = new Date();
  const [cancelled] = await db.update(routeOffers).set({
    status: "cancelled",
    respondedAt: now,
  }).where(and(
    eq(routeOffers.id, offer.id),
    eq(routeOffers.status, "accepted"),
  )).returning();
  if (!cancelled) return Response.json({ error: "The route changed on another device. Refresh and try again." }, { status: 409 });

  await db.update(bakeryPickupOccurrences).set({
    status: "confirmed",
    updatedAt: now,
  }).where(and(
    eq(bakeryPickupOccurrences.id, pickup.id),
    eq(bakeryPickupOccurrences.status, "reserved"),
  ));
  await db.update(driverRideRequests).set({
    status: "active",
    updatedAt: now,
  }).where(and(
    eq(driverRideRequests.id, offer.driverRequestId),
    eq(driverRideRequests.status, "matched"),
  ));
  const [route] = await db.select().from(rescueRoutes).where(and(
    eq(rescueRoutes.bakeryName, bakery.name),
    eq(rescueRoutes.pantryName, pantry.name),
    eq(rescueRoutes.driverName, driver.displayName),
    eq(rescueRoutes.status, "reserved"),
  )).limit(1);
  if (route) await db.update(rescueRoutes).set({ status: "cancelled" }).where(eq(rescueRoutes.id, route.id));

  await db.insert(inAppNotifications).values([
    {
      recipientType: "bakery", recipientId: bakery.id, eventType: "driver_cancelled_route",
      title: missedConfirmation ? "Driver did not reconfirm" : "Driver cancelled the pickup",
      body: `${driver.displayName} ${missedConfirmation ? "did not reconfirm this delivery in time" : "cancelled this delivery"}. The pickup is available for future driver searches again.`,
    },
    {
      recipientType: "pantry", recipientId: pantry.id, eventType: "driver_cancelled_route",
      title: "Planned delivery cancelled",
      body: `${driver.displayName} ${missedConfirmation ? "did not reconfirm" : "cancelled"} the planned delivery from ${bakery.name}. A future match may select a different pantry.`,
    },
    {
      recipientType: "driver", recipientId: driver.id, eventType: "route_cancelled",
      title: missedConfirmation ? "Reservation expired" : "Delivery cancelled",
      body: `${missedConfirmation ? "You did not reconfirm within 15 minutes. " : ""}The pickup from ${bakery.name} has returned to the available pickup pool.`,
    },
  ]);
  return Response.json({ offer: cancelled });
}

async function progressRoute(driver: typeof driverAccounts.$inferSelect, offerId: number, nextStage: string) {
  const db = getDb();
  const [offer] = await db.select().from(routeOffers).where(and(
    eq(routeOffers.id, offerId),
    eq(routeOffers.driverId, driver.id),
    eq(routeOffers.status, "accepted"),
  )).limit(1);
  if (!offer) return Response.json({ error: "Active route not found." }, { status: 404 });
  const transitions: Record<string, string[]> = {
    reserved: ["en_route_to_bakery"],
    en_route_to_bakery: ["arrived_at_bakery"],
    arrived_at_bakery: ["picked_up"],
    picked_up: ["arrived_at_pantry"],
    en_route_to_pantry: ["arrived_at_pantry"],
    arrived_at_pantry: ["completed"],
  };
  if (!transitions[offer.deliveryStage]?.includes(nextStage)) {
    return Response.json({ error: "That route update is not available at this stage." }, { status: 409 });
  }
  const now = new Date();
  const timestamps = {
    ...(nextStage === "arrived_at_bakery" ? { arrivedAtBakeryAt: now } : {}),
    ...(nextStage === "picked_up" ? { pickedUpAt: now } : {}),
    ...(nextStage === "arrived_at_pantry" ? { arrivedAtPantryAt: now } : {}),
    ...(nextStage === "completed" ? { completedAt: now } : {}),
  };
  const [updated] = await db.update(routeOffers).set({
    deliveryStage: nextStage as "en_route_to_bakery" | "arrived_at_bakery" | "picked_up" | "arrived_at_pantry" | "completed",
    ...timestamps,
  }).where(and(
    eq(routeOffers.id, offer.id),
    eq(routeOffers.deliveryStage, offer.deliveryStage),
  )).returning();
  if (!updated) return Response.json({ error: "The route changed on another device. Refresh and try again." }, { status: 409 });

  const [pickup] = await db.select().from(bakeryPickupOccurrences).where(eq(bakeryPickupOccurrences.id, offer.pickupOccurrenceId)).limit(1);
  const [[bakery], [pantry]] = await Promise.all([
    db.select().from(bakeries).where(eq(bakeries.id, pickup.bakeryId)).limit(1),
    db.select().from(pantries).where(eq(pantries.id, offer.pantryId)).limit(1),
  ]);
  if (bakery && pantry) {
    if (nextStage === "en_route_to_bakery") {
      await db.insert(inAppNotifications).values([
        {
          recipientType: "bakery", recipientId: bakery.id, eventType: "driver_began_delivery",
          title: "Driver is on the way", body: `${driver.displayName} has begun the delivery and is traveling to ${bakery.name}. The food is planned for ${pantry.name}.`,
        },
        {
          recipientType: "pantry", recipientId: pantry.id, eventType: "driver_began_delivery",
          title: "Delivery has begun", body: `${driver.displayName} is traveling to ${bakery.name} to collect the food planned for ${pantry.name}.`,
        },
      ]);
    } else if (nextStage === "arrived_at_bakery") {
      await db.insert(inAppNotifications).values({
        recipientType: "bakery", recipientId: bakery.id, eventType: "driver_arrived_at_bakery",
        title: "Driver has arrived", body: `${driver.displayName} has arrived at ${bakery.name} for the pickup.`,
        actionRequired: true, actionKey: `confirm-handoff:${offer.id}`,
      });
    } else if (nextStage === "picked_up") {
      await db.insert(inAppNotifications).values([
        {
          recipientType: "bakery", recipientId: bakery.id, eventType: "driver_picked_up",
          title: "Driver marked the food picked up", body: `${driver.displayName} is now taking the food to ${pantry.name}.`,
        },
        {
          recipientType: "pantry", recipientId: pantry.id, eventType: "delivery_en_route",
          title: "Your delivery is on the way",
          body: `${driver.displayName} picked up food from ${bakery.name}. Current estimated arrival: ${offer.estimatedPantryArrival.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}.`,
        },
      ]);
    } else if (nextStage === "arrived_at_pantry") {
      await db.insert(inAppNotifications).values({
        recipientType: "pantry", recipientId: pantry.id, eventType: "driver_arrived_at_pantry",
        title: "Driver has arrived", body: `${driver.displayName} has arrived with food from ${bakery.name}.`,
        actionRequired: true, actionKey: `confirm-delivery:${offer.id}`,
      });
    } else if (nextStage === "completed") {
      const [route] = await db.select().from(rescueRoutes).where(and(
        eq(rescueRoutes.bakeryName, bakery.name),
        eq(rescueRoutes.pantryName, pantry.name),
        eq(rescueRoutes.driverName, driver.displayName),
        eq(rescueRoutes.status, "reserved"),
      )).limit(1);
      if (route) await db.update(rescueRoutes).set({ status: "completed" }).where(eq(rescueRoutes.id, route.id));
    }
  }
  return Response.json({ offer: updated });
}

async function acceptOffer(driver: typeof driverAccounts.$inferSelect, offerId: number) {
  const db = getDb();
  const [offer] = await db.select().from(routeOffers).where(and(
    eq(routeOffers.id, offerId),
    eq(routeOffers.driverId, driver.id),
    eq(routeOffers.status, "offered"),
  )).limit(1);
  if (!offer || !offer.expiresAt || offer.expiresAt <= new Date()) return Response.json({ error: "This route offer is no longer available." }, { status: 409 });
  const [pickup] = await db.update(bakeryPickupOccurrences).set({
    status: "reserved",
    updatedAt: new Date(),
  }).where(and(
    eq(bakeryPickupOccurrences.id, offer.pickupOccurrenceId),
    eq(bakeryPickupOccurrences.status, "confirmed"),
  )).returning();
  if (!pickup) return Response.json({ error: "Another driver has already reserved this pickup." }, { status: 409 });

  const [[bakery], [pantry]] = await Promise.all([
    db.select().from(bakeries).where(eq(bakeries.id, pickup.bakeryId)).limit(1),
    db.select().from(pantries).where(eq(pantries.id, offer.pantryId)).limit(1),
  ]);
  if (!bakery || !pantry) return Response.json({ error: "Route organizations are unavailable." }, { status: 409 });
  await db.update(routeOffers).set({ status: "withdrawn", respondedAt: new Date() }).where(and(
    eq(routeOffers.pickupOccurrenceId, pickup.id),
    ne(routeOffers.id, offer.id),
  ));
  const confirmationDueAt = new Date(offer.estimatedBakeryArrival.getTime() - 60 * 60_000);
  const advanceReservation = confirmationDueAt > new Date();
  const [accepted] = await db.update(routeOffers).set({
    status: "accepted",
    respondedAt: new Date(),
    driverConfirmationDueAt: advanceReservation ? confirmationDueAt : null,
    driverConfirmationDeadlineAt: advanceReservation ? new Date(confirmationDueAt.getTime() + 15 * 60_000) : null,
    driverConfirmedAt: advanceReservation ? null : new Date(),
  }).where(eq(routeOffers.id, offer.id)).returning();
  await db.update(driverRideRequests).set({ status: "matched", updatedAt: new Date() }).where(eq(driverRideRequests.id, offer.driverRequestId));
  const eta = offer.estimatedBakeryArrival.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  const pantryEta = offer.estimatedPantryArrival.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  const [route] = await db.insert(rescueRoutes).values({
    bakeryName: bakery.name,
    pantryName: pantry.name,
    driverName: driver.displayName,
    scheduledArrival: offer.estimatedPantryArrival.toISOString(),
    status: "reserved",
  }).returning();
  await db.insert(inAppNotifications).values([
    {
      recipientType: "bakery", recipientId: bakery.id, eventType: "pickup_reserved",
      title: "A driver reserved this pickup",
      body: `${driver.displayName} is expected at approximately ${eta}. Food from ${bakery.name} will be delivered to ${pantry.name}.`,
      actionRequired: false,
    },
    {
      recipientType: "pantry", recipientId: pantry.id, eventType: "delivery_reserved",
      title: "An incoming delivery was reserved",
      body: `${driver.displayName} will bring food from ${bakery.name}. Current estimated arrival: ${pantryEta}.`,
      actionRequired: false,
    },
    {
      recipientType: "driver", recipientId: driver.id, eventType: "route_reserved",
      title: "Route reserved",
      body: `Pick up from ${bakery.name} around ${eta}, then deliver to ${pantry.name} around ${pantryEta}.`,
      actionRequired: true, actionKey: `confirm-route:${route.id}`,
    },
  ]);
  return Response.json({ offer: accepted, route });
}

async function declineOffer(driverId: number, offerId: number) {
  const db = getDb();
  const [offer] = await db.update(routeOffers).set({ status: "declined", respondedAt: new Date() }).where(and(
    eq(routeOffers.id, offerId),
    eq(routeOffers.driverId, driverId),
    eq(routeOffers.status, "offered"),
  )).returning();
  if (!offer) return Response.json({ error: "Route offer not found." }, { status: 404 });
  await promoteNextOffer(offer.pickupOccurrenceId);
  return Response.json({ offer });
}

async function expireAndAdvanceOffers() {
  const db = getDb();
  const offered = await db.select().from(routeOffers).where(eq(routeOffers.status, "offered"));
  for (const offer of offered) {
    if (offer.expiresAt && offer.expiresAt <= new Date()) {
      await db.update(routeOffers).set({ status: "expired", respondedAt: new Date() }).where(eq(routeOffers.id, offer.id));
      await promoteNextOffer(offer.pickupOccurrenceId);
    }
  }
}

async function promoteNextOffer(pickupOccurrenceId: number) {
  const db = getDb();
  const queued = await db.select().from(routeOffers).where(and(
    eq(routeOffers.pickupOccurrenceId, pickupOccurrenceId),
    eq(routeOffers.status, "queued"),
  ));
  const next = queued.sort((a, b) => a.rank - b.rank)[0];
  if (!next) return;
  const [offer] = await db.update(routeOffers).set({
    status: "offered", offeredAt: new Date(), expiresAt: new Date(Date.now() + 5 * 60_000),
  }).where(and(eq(routeOffers.id, next.id), eq(routeOffers.status, "queued"))).returning();
  if (!offer) return;
  await db.insert(inAppNotifications).values({
    recipientType: "driver", recipientId: offer.driverId, eventType: "route_offer",
    title: "A route matches your request",
    body: "A confirmed bakery pickup matches your saved ride request. This offer is held for five minutes.",
    actionRequired: true, actionKey: `route-offer:${offer.id}`,
  });
}

function validDate(value: unknown) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid service date.");
  return date;
}
function validDateTime(value: unknown, label: string) {
  const date = new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is required.`);
  return date;
}
function optionalZip(value: unknown, label: string) {
  const zip = String(value ?? "").trim();
  if (zip && !/^\d{5}$/.test(zip)) throw new Error(`${label} must contain five digits.`);
  return zip;
}
