import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  bakeryPickupOccurrences,
  driverRideRequests,
  inAppNotifications,
  pantries,
  partnerAccounts,
  routeOffers,
} from "../db/schema";

type PickupOccurrence = typeof bakeryPickupOccurrences.$inferSelect;

export async function matchConfirmedPickup(pickup: PickupOccurrence, bakeryName: string, bakeryLatitude: number | null, bakeryLongitude: number | null) {
  const db = getDb();
  const [requests, pantryRows, pantryAccounts] = await Promise.all([
    db.select().from(driverRideRequests).where(and(
      eq(driverRideRequests.serviceDate, pickup.serviceDate),
      eq(driverRideRequests.status, "active"),
    )),
    db.select().from(pantries).where(eq(pantries.active, true)),
    db.select({
      organizationId: partnerAccounts.organizationId,
    }).from(partnerAccounts).where(and(
      eq(partnerAccounts.organizationType, "pantry"),
      eq(partnerAccounts.active, true),
    )),
  ]);
  if (!requests.length || bakeryLatitude === null || bakeryLongitude === null) return { matchedRequests: 0, offered: false };

  const registeredPantryIds = new Set(pantryAccounts.map((account) => account.organizationId));
  const eligiblePantries = pantryRows.filter((pantry) =>
    registeredPantryIds.has(pantry.id)
    && pantry.addressValidationStatus === "validated"
    && pantry.latitude !== null
    && pantry.longitude !== null,
  );
  if (!eligiblePantries.length) return { matchedRequests: 0, offered: false };

  const candidates = requests.flatMap((request) => {
    const bakeryArrival = new Date(Math.max(request.earliestStart.getTime(), pickup.pickupWindowStartsAt.getTime()));
    if (bakeryArrival > pickup.pickupDeadline) return [];
    return eligiblePantries.flatMap((pantry) => {
      const miles = milesBetween(bakeryLatitude, bakeryLongitude, pantry.latitude!, pantry.longitude!);
      const driveMinutes = Math.max(5, Math.ceil((miles / 25) * 60));
      const pantryArrival = new Date(bakeryArrival.getTime() + (15 + driveMinutes) * 60_000);
      const completion = new Date(pantryArrival.getTime() + 15 * 60_000);
      if (completion > request.latestFinish || !pantryAcceptsAt(pantry, pantryArrival)) return [];
      const priority = 1 / (1 + pantry.deliveriesSevenDays);
      const destinationBonus = request.endZip && pantry.address.includes(request.endZip) ? 5 : 0;
      const score = priority * 20 + destinationBonus - miles;
      return [{ request, pantry, bakeryArrival, pantryArrival, score }];
    });
  });

  const bestCandidateByRequest = new Map<number, typeof candidates[number]>();
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (!bestCandidateByRequest.has(candidate.request.id)) bestCandidateByRequest.set(candidate.request.id, candidate);
  }
  const bestByRequest = [...bestCandidateByRequest.values()].sort((a, b) => b.score - a.score);

  const created: Array<typeof routeOffers.$inferSelect> = [];
  for (let index = 0; index < bestByRequest.length; index += 1) {
    const candidate = bestByRequest[index];
    const [existing] = await db.select().from(routeOffers).where(and(
      eq(routeOffers.driverRequestId, candidate.request.id),
      eq(routeOffers.pickupOccurrenceId, pickup.id),
    )).limit(1);
    if (existing) {
      created.push(existing);
      continue;
    }
    const offered = index === 0;
    // This preliminary window is replaced by traffic-aware travel time once the
    // driver shares a live starting location.
    const departureWindowEndsAt = new Date(candidate.bakeryArrival.getTime() - 10 * 60_000);
    const earliestProposedDeparture = new Date(departureWindowEndsAt.getTime() - 30 * 60_000);
    const departureWindowStartsAt = new Date(Math.max(candidate.request.earliestStart.getTime(), earliestProposedDeparture.getTime()));
    const [offer] = await db.insert(routeOffers).values({
      pickupOccurrenceId: pickup.id,
      driverRequestId: candidate.request.id,
      driverId: candidate.request.driverId,
      pantryId: candidate.pantry.id,
      rank: index + 1,
      score: candidate.score,
      estimatedBakeryArrival: candidate.bakeryArrival,
      estimatedPantryArrival: candidate.pantryArrival,
      departureWindowStartsAt,
      departureWindowEndsAt: departureWindowEndsAt < departureWindowStartsAt ? departureWindowStartsAt : departureWindowEndsAt,
      status: offered ? "offered" : "queued",
      offeredAt: offered ? new Date() : null,
      expiresAt: offered ? new Date(Date.now() + 5 * 60_000) : null,
    }).returning();
    created.push(offer);
    if (offered) {
      await db.insert(inAppNotifications).values({
        recipientType: "driver",
        recipientId: candidate.request.driverId,
        eventType: "route_offer",
        title: "A route matches your request",
        body: `Pick up from ${bakeryName} and deliver to ${candidate.pantry.name}. This offer is held for five minutes.`,
        actionRequired: true,
        actionKey: `route-offer:${offer.id}`,
      });
    }
  }
  return { matchedRequests: created.length, offered: created.some((offer) => offer.status === "offered") };
}

function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthMiles = 3958.8;
  const latitudeDelta = toRadians(lat2 - lat1);
  const longitudeDelta = toRadians(lon2 - lon1);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pantryAcceptsAt(pantry: typeof pantries.$inferSelect, arrival: Date) {
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/New_York" }).format(arrival);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York",
  }).format(arrival).replace("24:", "00:");
  try {
    const opens = JSON.parse(pantry.openTime) as Array<{ day: string; time: string; recurrence: string; ordinal: number | null }> | Record<string, string>;
    const latest = JSON.parse(pantry.latestArrival) as Array<{ time: string }> | Record<string, string>;
    if (Array.isArray(opens) && Array.isArray(latest)) {
      return opens.some((window, index) => {
        if (window.day !== day || time < window.time || time > (latest[index]?.time ?? "")) return false;
        if (window.recurrence !== "monthly") return true;
        const occurrence = Math.ceil(Number(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "America/New_York" }).format(arrival)) / 7);
        return occurrence === window.ordinal;
      });
    }
    const legacyOpens = opens as Record<string, string>;
    return Boolean(legacyOpens[day] && time >= legacyOpens[day] && time <= (latest as Record<string, string>)[day]);
  } catch {
    return pantry.recurringDays.split(",").map((value) => value.trim()).includes(day)
      && time >= pantry.openTime && time <= pantry.latestArrival;
  }
}
