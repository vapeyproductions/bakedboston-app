import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, bakeryPickupOccurrences, inAppNotifications, partnerAccounts } from "../../../../db/schema";
import { getPartnerAccountId } from "../../../partner-auth";
import { writeAudit } from "../../../audit";
import { matchConfirmedPickup } from "../../../pickup-matching";

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
    if (existing.status === "reserved" && status !== "cancelled") {
      return Response.json({ error: "This pickup is already reserved." }, { status: 409 });
    }
    const [occurrence] = await db.update(bakeryPickupOccurrences).set({
      status: status as "confirmed" | "decision_deferred" | "insufficient_food" | "cancelled",
      confirmedAt: status === "confirmed" ? new Date() : null,
      confirmationNote: String(body.note ?? "").trim(),
      updatedAt: new Date(),
    }).where(eq(bakeryPickupOccurrences.id, id)).returning();

    let matching = { matchedRequests: 0, offered: false };
    if (status === "confirmed") {
      matching = await matchConfirmedPickup(occurrence, current.bakery.name, current.bakery.latitude, current.bakery.longitude);
      await db.insert(inAppNotifications).values({
        recipientType: "bakery",
        recipientId: current.bakery.id,
        eventType: "pickup_confirmed",
        title: "Pickup availability confirmed",
        body: matching.matchedRequests
          ? `${matching.matchedRequests} saved driver request${matching.matchedRequests === 1 ? "" : "s"} matched this pickup.`
          : "This pickup is now available for driver matching.",
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
