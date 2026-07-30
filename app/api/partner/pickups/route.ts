import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, bakeryPickupOccurrences, partnerAccounts, routeOffers } from "../../../../db/schema";
import { getPartnerAccountId } from "../../../partner-auth";
import { writeAudit } from "../../../audit";
import { matchConfirmedPickup } from "../../../pickup-matching";
import { replaceOperationalNotification } from "../../../operational-notifications";
import { firstCommitmentReminder, nextCommitmentReminder } from "../../../bakery-commitments";
import { earliestUnresolvedPickup, pickupWindowDescription } from "../../../pickup-ordering";

async function currentBakery() {
  const accountId = await getPartnerAccountId();
  if (!accountId) return null;
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(and(
    eq(partnerAccounts.id, accountId),
    eq(partnerAccounts.organizationType, "bakery"),
    eq(partnerAccounts.active, true),
  )).limit(1);
  if (!account) return null;
  const [bakery] = await db.select().from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1);
  return bakery ? { account, bakery } : null;
}

export async function GET() {
  const current = await currentBakery();
  if (!current) return Response.json({ error: "Bakery sign-in required." }, { status: 401 });
  const occurrences = await getDb().select().from(bakeryPickupOccurrences).where(and(
    eq(bakeryPickupOccurrences.bakeryId, current.bakery.id),
    gte(bakeryPickupOccurrences.pickupDeadline, new Date(Date.now() - 24 * 60 * 60 * 1000)),
  )).orderBy(desc(bakeryPickupOccurrences.pickupWindowStartsAt));
  return Response.json({ occurrences });
}

export async function POST(request: Request) {
  const current = await currentBakery();
  if (!current) return Response.json({ error: "Bakery sign-in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const serviceDate = validDate(body.serviceDate);
    const pickupWindowStartsAt = validDateTime(body.pickupWindowStartsAt, "Pickup window start");
    const pickupDeadline = validDateTime(body.pickupDeadline, "Pickup deadline");
    if (pickupDeadline <= pickupWindowStartsAt) throw new Error("Pickup deadline must be later than the pickup start.");
    const db = getDb();
    const [existing] = await db.select().from(bakeryPickupOccurrences).where(and(
      eq(bakeryPickupOccurrences.bakeryId, current.bakery.id),
      eq(bakeryPickupOccurrences.pickupWindowStartsAt, pickupWindowStartsAt),
    )).limit(1);
    if (existing) return Response.json({ occurrence: existing });
    const [occurrence] = await db.insert(bakeryPickupOccurrences).values({
      bakeryId: current.bakery.id,
      serviceDate,
      pickupWindowStartsAt,
      pickupDeadline,
      commitmentReminderDueAt: firstCommitmentReminder(current.bakery, serviceDate, pickupWindowStartsAt),
    }).returning();
    return Response.json({ occurrence }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create this pickup." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const current = await currentBakery();
  if (!current) return Response.json({ error: "Bakery sign-in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    const status = String(body.status ?? "");
    if (!Number.isInteger(id) || !["confirmed", "decision_deferred", "insufficient_food", "cancelled"].includes(status)) {
      throw new Error("Choose a valid pickup response.");
    }
    const db = getDb();
    const [existing] = await db.select().from(bakeryPickupOccurrences).where(and(
      eq(bakeryPickupOccurrences.id, id),
      eq(bakeryPickupOccurrences.bakeryId, current.bakery.id),
    )).limit(1);
    if (!existing) return Response.json({ error: "Pickup occurrence not found." }, { status: 404 });
    if (new Date(existing.pickupDeadline) <= new Date()) return Response.json({ error: "This pickup window has ended." }, { status: 409 });
    const earliest = await earliestUnresolvedPickup(current.bakery.id);
    if (earliest && earliest.id !== existing.id) {
      return Response.json({
        error: `Please finish the earlier ${pickupWindowDescription(earliest.pickupWindowStartsAt, earliest.pickupDeadline)} pickup window before updating this one.`,
      }, { status: 409 });
    }
    if (existing.status === "reserved" && status !== "cancelled") {
      return Response.json({ error: "This pickup is already reserved." }, { status: 409 });
    }
    const activeOffer = await db.select({ id: routeOffers.id }).from(routeOffers).where(and(
      eq(routeOffers.pickupOccurrenceId, existing.id), eq(routeOffers.status, "accepted"),
      inArray(routeOffers.deliveryStage, ["en_route_to_bakery", "arrived_at_bakery", "picked_up", "en_route_to_pantry", "arrived_at_pantry"]),
    )).limit(1);
    if (activeOffer[0]) return Response.json({ error: "The driver has started this delivery, so food availability can no longer be changed." }, { status: 409 });
    const [occurrence] = await db.update(bakeryPickupOccurrences).set({
      status: status as "confirmed" | "decision_deferred" | "insufficient_food" | "cancelled",
      confirmedAt: status === "confirmed" ? new Date() : null,
      commitmentReminderDueAt: status === "decision_deferred" ? nextCommitmentReminder(existing.pickupWindowStartsAt) : null,
      confirmationNote: String(body.note ?? "").trim(),
      updatedAt: new Date(),
    }).where(eq(bakeryPickupOccurrences.id, id)).returning();

    let matching = { matchedRequests: 0, offered: false };
    if (status === "confirmed") {
      matching = await matchConfirmedPickup(occurrence, current.bakery.name, current.bakery.latitude, current.bakery.longitude);
      await replaceOperationalNotification({
        recipientType: "bakery",
        recipientId: current.bakery.id,
        eventType: "pickup_confirmed",
        threadKey: `pickup:${occurrence.id}`,
        title: "Pickup window confirmed",
        body: `Pickup window from ${pickupWindowDescription(occurrence.pickupWindowStartsAt, occurrence.pickupDeadline)} is confirmed.`,
      });
    } else {
      await db.update(routeOffers).set({ status: "withdrawn", respondedAt: new Date() }).where(and(
        eq(routeOffers.pickupOccurrenceId, occurrence.id),
        inArray(routeOffers.status, ["queued", "offered"]),
      ));
      await replaceOperationalNotification({
        recipientType: "bakery",
        recipientId: current.bakery.id,
        eventType: status === "insufficient_food" ? "pickup_unavailable" : "pickup_decision_deferred",
        threadKey: `pickup:${occurrence.id}`,
        title: status === "insufficient_food" ? "No pickup planned today" : "Pickup decision postponed",
        body: status === "insufficient_food"
          ? "You marked today’s pickup unavailable. You can change this decision from the availability card."
          : "This pickup is not available to drivers until food availability is confirmed.",
      });
    }
    await writeAudit({
      actorType: "partner", actorId: current.account.id, actorName: current.account.accountEmail,
      action: `set pickup occurrence to ${status.replaceAll("_", " ")}`,
      entityType: "bakery", entityId: current.bakery.id, entityName: current.bakery.name,
      details: `${occurrence.serviceDate} · ${occurrence.pickupWindowStartsAt.toISOString()}`,
    });
    return Response.json({ occurrence, matching });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update this pickup." }, { status: 400 });
  }
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
