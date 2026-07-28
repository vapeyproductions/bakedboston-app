import { createHash } from "crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeryPickupOccurrences, inAppNotifications, mobileSessions, partnerAccounts, routeOffers } from "../../../../db/schema";
import { markPickupReady } from "../../../pickup-readiness";
import { recordBakeryHandoff } from "../../../bakery-handoffs";
import { writeAudit } from "../../../audit";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

async function recipient(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  if (!token) return null;
  const db = getDb();
  const [session] = await db.select().from(mobileSessions).where(and(
    eq(mobileSessions.tokenHash, tokenHash(token)),
    gt(mobileSessions.expiresAt, new Date()),
  )).limit(1);
  if (!session) return null;
  if (session.role === "driver") return { type: "driver" as const, id: session.accountId, pickupBakeryId: null };
  const [account] = await db.select().from(partnerAccounts).where(and(
    eq(partnerAccounts.id, session.accountId),
    eq(partnerAccounts.active, true),
  )).limit(1);
  if (!account || account.organizationType !== session.role) return null;
  return {
    type: account.organizationType,
    id: account.organizationId,
    pickupBakeryId: account.organizationType === "bakery" ? account.organizationId : null,
  };
}

export async function GET(request: Request) {
  const current = await recipient(request);
  if (!current) return Response.json({ error: "Session expired." }, { status: 401 });
  const db = getDb();
  const [notifications, pickupOccurrences] = await Promise.all([
    db.select().from(inAppNotifications).where(and(
      eq(inAppNotifications.recipientType, current.type),
      eq(inAppNotifications.recipientId, current.id),
    )).orderBy(desc(inAppNotifications.createdAt)).limit(100),
    current.pickupBakeryId
      ? db.select().from(bakeryPickupOccurrences).where(eq(bakeryPickupOccurrences.bakeryId, current.pickupBakeryId)).orderBy(desc(bakeryPickupOccurrences.pickupWindowStartsAt))
      : Promise.resolve([]),
  ]);
  return Response.json({ notifications, pickupOccurrences });
}

export async function PATCH(request: Request) {
  const current = await recipient(request);
  if (!current) return Response.json({ error: "Session expired." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  if (body.action === "pickup-ready") {
    if (current.type !== "bakery") return Response.json({ error: "Only bakery accounts can confirm pickup readiness." }, { status: 403 });
    const offer = await markPickupReady(current.id, Number(body.offerId));
    return offer ? Response.json({ offer }) : Response.json({ error: "Active pickup not found." }, { status: 404 });
  }
  if (body.action === "confirm-handoff" || body.action === "handoff-not-picked-up") {
    if (current.type !== "bakery") return Response.json({ error: "Only bakery accounts can respond to pickup handoffs." }, { status: 403 });
    const result = await recordBakeryHandoff(current.id, Number(body.offerId), body.action === "confirm-handoff");
    return "error" in result ? Response.json({ error: result.error }, { status: result.status }) : Response.json(result);
  }
  if (body.action === "confirm-delivery") {
    if (current.type !== "pantry") return Response.json({ error: "Only pantry accounts can confirm deliveries." }, { status: 403 });
    const offerId = Number(body.offerId);
    const received = body.received === true;
    const db = getDb();
    const [offer] = await db.select().from(routeOffers).where(and(eq(routeOffers.id, offerId), eq(routeOffers.pantryId, current.id), eq(routeOffers.deliveryStage, "completed"))).limit(1);
    if (!offer) return Response.json({ error: "Completed delivery not found." }, { status: 404 });
    const [notification] = await db.update(inAppNotifications).set({ readAt: new Date(), acknowledgedAt: new Date(), actionRequired: false }).where(and(
      eq(inAppNotifications.recipientType, "pantry"), eq(inAppNotifications.recipientId, current.id), eq(inAppNotifications.actionKey, `confirm-delivery:${offerId}`),
    )).returning();
    if (!received) {
      await db.insert(inAppNotifications).values({ recipientType: "admin", recipientId: 0, eventType: "delivery_disputed", threadKey: `delivery:${offerId}`, title: "Pantry reported a missing delivery", body: `Pantry ${current.id} reported that completed delivery ${offerId} did not arrive.` });
      await writeAudit({ actorType: "partner", actorId: current.id, actorName: `Pantry ${current.id}`, action: "reported completed delivery missing", entityType: "delivery", entityId: offerId, entityName: `Delivery ${offerId}`, details: "Driver marked the delivery complete, but the pantry reported that it did not arrive." });
    }
    return Response.json({ notification, received });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "A valid notification is required." }, { status: 400 });
  const [notification] = await getDb().update(inAppNotifications).set({
    readAt: new Date(),
    ...(body.acknowledge ? { acknowledgedAt: new Date() } : {}),
  }).where(and(
    eq(inAppNotifications.id, id),
    eq(inAppNotifications.recipientType, current.type),
    eq(inAppNotifications.recipientId, current.id),
  )).returning();
  if (!notification) return Response.json({ error: "Notification not found." }, { status: 404 });
  return Response.json({ notification });
}
