import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { availabilityPauses, availabilityWindows, bakeryPickupOccurrences, partnerAccounts, routeOffers } from "../../../../db/schema";
import { writeAudit } from "../../../audit";
import { getPartnerAccountId } from "../../../partner-auth";
import { firstSpontaneousCommitmentReminder } from "../../../bakery-commitments";

async function account() {
  const id = await getPartnerAccountId();
  if (!id) return null;
  const [record] = await getDb().select().from(partnerAccounts).where(eq(partnerAccounts.id, id)).limit(1);
  return record ?? null;
}
export async function GET() {
  const current = await account();
  if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
  const db = getDb();
  const [windows, pauses] = await Promise.all([
    db.select().from(availabilityWindows).where(and(eq(availabilityWindows.organizationType, current.organizationType), eq(availabilityWindows.organizationId, current.organizationId), gt(availabilityWindows.endsAt, new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)))),
    db.select().from(availabilityPauses).where(and(eq(availabilityPauses.organizationType, current.organizationType), eq(availabilityPauses.organizationId, current.organizationId), gt(availabilityPauses.endsAt, new Date()))),
  ]);
  if (current.organizationType === "bakery") {
    await Promise.all(windows.filter((window) => window.endsAt > new Date()).map((window) =>
      db.insert(bakeryPickupOccurrences).values({
        bakeryId: current.organizationId,
        serviceDate: easternDate(window.startsAt),
        pickupWindowStartsAt: window.startsAt,
        pickupDeadline: window.endsAt,
        commitmentReminderDueAt: firstSpontaneousCommitmentReminder(window.startsAt, window.createdAt),
      }).onConflictDoNothing(),
    ));
  }
  return Response.json({ windows, pauses });
}
export async function POST(request: Request) {
  const current = await account();
  if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const db = getDb();
  if (body.mode === "pause") {
    if (current.organizationType === "bakery") await cancelUnstartedBakeryReservations(current.organizationId);
    const endsAt = validDate(body.endsAt, "Pause end time");
    const [record] = await db.insert(availabilityPauses).values({ organizationType: current.organizationType, organizationId: current.organizationId, endsAt }).returning();
    await audit(current, "paused scheduled availability", endsAt.toISOString());
    return Response.json({ record }, { status: 201 });
  }
  const startsAt = validDate(body.startsAt, "Opening time");
  const endsAt = validDate(body.endsAt, "Closing time");
  const latestArrival = validDate(body.latestArrival, "Latest permitted arrival");
  const serviceMode = validServiceMode(body.serviceMode, current.organizationType);
  validateWindow(startsAt, endsAt, latestArrival);
  if (endsAt.getTime() <= Date.now()) return Response.json({ error: "The one-time window must end in the future." }, { status: 400 });
  const [record] = await db.insert(availabilityWindows).values({ organizationType: current.organizationType, organizationId: current.organizationId, startsAt, endsAt, latestArrival, serviceMode, paused: false }).returning();
  if (current.organizationType === "bakery") {
    await db.insert(bakeryPickupOccurrences).values({
      bakeryId: current.organizationId,
      serviceDate: easternDate(startsAt),
      pickupWindowStartsAt: startsAt,
      pickupDeadline: endsAt,
      commitmentReminderDueAt: firstSpontaneousCommitmentReminder(startsAt),
    }).onConflictDoNothing();
  }
  await audit(current, "created one-time availability window", `${startsAt.toISOString()}–${endsAt.toISOString()}`);
  return Response.json({ record }, { status: 201 });
}
export async function PATCH(request: Request) {
  const current = await account();
  if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const id = Number(body.id);
  const db = getDb();
  const [window] = await db.select().from(availabilityWindows).where(eq(availabilityWindows.id, id)).limit(1);
  if (!window || window.organizationType !== current.organizationType || window.organizationId !== current.organizationId) return Response.json({ error: "Availability window not found." }, { status: 404 });
  if (typeof body.paused === "boolean") {
    if (body.paused && current.organizationType === "bakery") {
      const [pickup] = await db.select().from(bakeryPickupOccurrences).where(and(eq(bakeryPickupOccurrences.bakeryId, current.organizationId), eq(bakeryPickupOccurrences.pickupWindowStartsAt, window.startsAt))).limit(1);
      if (pickup) await cancelUnstartedBakeryReservations(current.organizationId, pickup.id);
    }
    const [record] = await db.update(availabilityWindows).set({ paused: body.paused }).where(eq(availabilityWindows.id, id)).returning();
    await audit(current, body.paused ? "paused one-time availability window" : "resumed one-time availability window", String(id));
    return Response.json({ record });
  }
  const startsAt = validDate(body.startsAt, "Opening time");
  const endsAt = validDate(body.endsAt, "Closing time");
  const latestArrival = validDate(body.latestArrival, "Latest permitted arrival");
  const serviceMode = validServiceMode(body.serviceMode, current.organizationType);
  validateWindow(startsAt, endsAt, latestArrival);
  const [record] = await db.update(availabilityWindows).set({ startsAt, endsAt, latestArrival, serviceMode }).where(eq(availabilityWindows.id, id)).returning();
  if (current.organizationType === "bakery") {
    const [updatedOccurrence] = await db.update(bakeryPickupOccurrences).set({
      serviceDate: easternDate(startsAt),
      pickupWindowStartsAt: startsAt,
      pickupDeadline: endsAt,
      commitmentReminderDueAt: firstSpontaneousCommitmentReminder(startsAt),
      updatedAt: new Date(),
    }).where(and(
      eq(bakeryPickupOccurrences.bakeryId, current.organizationId),
      eq(bakeryPickupOccurrences.pickupWindowStartsAt, window.startsAt),
    )).returning();
    if (!updatedOccurrence) {
      await db.insert(bakeryPickupOccurrences).values({
        bakeryId: current.organizationId,
        serviceDate: easternDate(startsAt),
        pickupWindowStartsAt: startsAt,
        pickupDeadline: endsAt,
        commitmentReminderDueAt: firstSpontaneousCommitmentReminder(startsAt),
      }).onConflictDoNothing();
    }
  }
  await audit(current, "updated one-time availability window", String(id));
  return Response.json({ record });
}
export async function DELETE(request: Request) {
  const current = await account();
  if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  const type = url.searchParams.get("type");
  const db = getDb();
  if (type === "pause") {
    const [pause] = await db.select().from(availabilityPauses).where(eq(availabilityPauses.id, id)).limit(1);
    if (!pause || pause.organizationType !== current.organizationType || pause.organizationId !== current.organizationId) return Response.json({ error: "Pause not found." }, { status: 404 });
    await db.delete(availabilityPauses).where(eq(availabilityPauses.id, id));
    await audit(current, "resumed scheduled availability", String(id));
  } else {
    const [window] = await db.select().from(availabilityWindows).where(eq(availabilityWindows.id, id)).limit(1);
    if (!window || window.organizationType !== current.organizationType || window.organizationId !== current.organizationId) return Response.json({ error: "Availability window not found." }, { status: 404 });
    await db.delete(availabilityWindows).where(eq(availabilityWindows.id, id));
    if (current.organizationType === "bakery") {
      await db.delete(bakeryPickupOccurrences).where(and(
        eq(bakeryPickupOccurrences.bakeryId, current.organizationId),
        eq(bakeryPickupOccurrences.pickupWindowStartsAt, window.startsAt),
      ));
    }
    await audit(current, "deleted one-time availability window", String(id));
  }
  return Response.json({ ok: true });
}
function validDate(value: unknown, label: string) { const date = new Date(String(value ?? "")); if (!Number.isFinite(date.getTime())) throw new Error(`${label} is required.`); return date; }
function validateWindow(start: Date, end: Date, latest: Date) { if (end <= start) throw new Error("Closing time must be later than opening time."); if (latest < start || latest > end) throw new Error("Latest permitted arrival must fall within the availability window."); }
function validServiceMode(value: unknown, type: string) { if (type === "bakery") return "staffed" as const; if (value !== "staffed" && value !== "unattended") throw new Error("Choose whether the receiving window is staffed or unattended."); return value; }
function easternDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
async function audit(current: NonNullable<Awaited<ReturnType<typeof account>>>, action: string, details: string) { await writeAudit({ actorType: "partner", actorId: current.id, actorName: current.accountEmail, action, entityType: current.organizationType, entityId: current.organizationId, entityName: current.accountEmail, details }); }

async function cancelUnstartedBakeryReservations(bakeryId: number, onlyPickupId?: number) {
  const db = getDb();
  const pickups = onlyPickupId
    ? [{ id: onlyPickupId }]
    : await db.select({ id: bakeryPickupOccurrences.id }).from(bakeryPickupOccurrences).where(eq(bakeryPickupOccurrences.bakeryId, bakeryId));
  const pickupIds = pickups.map((pickup) => pickup.id);
  if (!pickupIds.length) return;
  const active = await db.select({ id: routeOffers.id }).from(routeOffers).where(and(
    inArray(routeOffers.pickupOccurrenceId, pickupIds), eq(routeOffers.status, "accepted"),
    inArray(routeOffers.deliveryStage, ["en_route_to_bakery", "arrived_at_bakery", "picked_up", "en_route_to_pantry", "arrived_at_pantry"]),
  )).limit(1);
  if (active[0]) throw new Error("This pickup is already in progress and can no longer be paused.");
  const reserved = await db.select({ id: routeOffers.id, pickupOccurrenceId: routeOffers.pickupOccurrenceId }).from(routeOffers).where(and(
    inArray(routeOffers.pickupOccurrenceId, pickupIds), eq(routeOffers.status, "accepted"), eq(routeOffers.deliveryStage, "reserved"),
  ));
  if (!reserved.length) return;
  const now = new Date();
  await db.update(routeOffers).set({ status: "cancelled", respondedAt: now }).where(inArray(routeOffers.id, reserved.map((offer) => offer.id)));
  await db.update(bakeryPickupOccurrences).set({ status: "confirmed", updatedAt: now }).where(inArray(bakeryPickupOccurrences.id, reserved.map((offer) => offer.pickupOccurrenceId)));
}
