import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { bakeryPickupOccurrences } from "../db/schema";

const unresolvedPickupStatuses = ["awaiting_confirmation", "decision_deferred", "confirmed", "reserved"] as const;

export async function earliestUnresolvedPickup(bakeryId: number, now = new Date()) {
  const [occurrence] = await getDb().select().from(bakeryPickupOccurrences).where(and(
    eq(bakeryPickupOccurrences.bakeryId, bakeryId),
    gt(bakeryPickupOccurrences.pickupDeadline, now),
    inArray(bakeryPickupOccurrences.status, [...unresolvedPickupStatuses]),
  )).orderBy(asc(bakeryPickupOccurrences.pickupWindowStartsAt)).limit(1);
  return occurrence ?? null;
}

export function pickupWindowDescription(startsAt: Date, endsAt: Date) {
  const format = (value: Date) => value.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${format(startsAt)}–${format(endsAt)}`;
}
