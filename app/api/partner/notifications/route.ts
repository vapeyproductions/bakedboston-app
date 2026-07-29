import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, inAppNotifications, pantries, partnerAccounts, rescueRoutes, routeOffers } from "../../../../db/schema";
import { getPartnerAccountId } from "../../../partner-auth";
import { markPickupReady } from "../../../pickup-readiness";
import { recordBakeryHandoff } from "../../../bakery-handoffs";
import { writeAudit } from "../../../audit";

async function currentRecipient() {
  const accountId = await getPartnerAccountId();
  if (!accountId) return null;
  const [account] = await getDb().select().from(partnerAccounts).where(and(
    eq(partnerAccounts.id, accountId),
    eq(partnerAccounts.active, true),
  )).limit(1);
  if (!account) return null;
  const [organization] = account.organizationType === "bakery"
    ? await getDb().select({ name: bakeries.name }).from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1)
    : await getDb().select({ name: pantries.name }).from(pantries).where(eq(pantries.id, account.organizationId)).limit(1);
  return organization ? { type: account.organizationType, id: account.organizationId, name: organization.name } : null;
}

export async function GET() {
  const recipient = await currentRecipient();
  if (!recipient) return Response.json({ error: "Sign in required." }, { status: 401 });
  const db = getDb();
  const [notifications, routes] = await Promise.all([
    db.select().from(inAppNotifications).where(and(
      eq(inAppNotifications.recipientType, recipient.type),
      eq(inAppNotifications.recipientId, recipient.id),
    )).orderBy(desc(inAppNotifications.createdAt)).limit(100),
    recipient.type === "bakery"
      ? db.select().from(rescueRoutes).where(eq(rescueRoutes.bakeryName, recipient.name)).orderBy(desc(rescueRoutes.createdAt))
      : db.select().from(rescueRoutes).where(eq(rescueRoutes.pantryName, recipient.name)).orderBy(desc(rescueRoutes.createdAt)),
  ]);
  return Response.json({ notifications, routes });
}

export async function PATCH(request: Request) {
  const recipient = await currentRecipient();
  if (!recipient) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  if (body.action === "pickup-ready") {
    if (recipient.type !== "bakery") return Response.json({ error: "Only bakery accounts can confirm pickup readiness." }, { status: 403 });
    const offer = await markPickupReady(recipient.id, Number(body.offerId));
    return offer ? Response.json({ offer }) : Response.json({ error: "Active pickup not found." }, { status: 404 });
  }
  if (body.action === "confirm-handoff" || body.action === "handoff-not-picked-up") {
    if (recipient.type !== "bakery") return Response.json({ error: "Only bakery accounts can respond to pickup handoffs." }, { status: 403 });
    const result = await recordBakeryHandoff(recipient.id, Number(body.offerId), body.action === "confirm-handoff");
    return "error" in result ? Response.json({ error: result.error }, { status: result.status }) : Response.json(result);
  }
  if (body.action === "confirm-delivery") {
    if (recipient.type !== "pantry") return Response.json({ error: "Only pantry accounts can confirm deliveries." }, { status: 403 });
    const offerId = Number(body.offerId);
    const received = body.received === true;
    const db = getDb();
    const [offer] = await db.select().from(routeOffers).where(and(eq(routeOffers.id, offerId), eq(routeOffers.pantryId, recipient.id), eq(routeOffers.deliveryStage, "completed"))).limit(1);
    if (!offer) return Response.json({ error: "Completed delivery not found." }, { status: 404 });
    const [notification] = await db.update(inAppNotifications).set({ readAt: new Date(), acknowledgedAt: new Date(), actionRequired: false }).where(and(
      eq(inAppNotifications.recipientType, "pantry"), eq(inAppNotifications.recipientId, recipient.id), eq(inAppNotifications.actionKey, `confirm-delivery:${offerId}`),
    )).returning();
    if (!received) {
      await db.insert(inAppNotifications).values({ recipientType: "admin", recipientId: 0, eventType: "delivery_disputed", threadKey: `delivery:${offerId}`, title: "Pantry reported a missing delivery", body: `Pantry ${recipient.id} reported that completed delivery ${offerId} did not arrive.` });
      await writeAudit({ actorType: "partner", actorId: recipient.id, actorName: `Pantry ${recipient.id}`, action: "reported completed delivery missing", entityType: "delivery", entityId: offerId, entityName: `Delivery ${offerId}`, details: "Driver marked the delivery complete, but the pantry reported that it did not arrive." });
    }
    return Response.json({ notification, received });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id)) return Response.json({ error: "A valid notification is required." }, { status: 400 });
  const [notification] = await getDb().update(inAppNotifications).set({
    readAt: new Date(),
    ...(body.acknowledge ? { acknowledgedAt: new Date() } : {}),
  }).where(and(
    eq(inAppNotifications.id, id),
    eq(inAppNotifications.recipientType, recipient.type),
    eq(inAppNotifications.recipientId, recipient.id),
  )).returning();
  if (!notification) return Response.json({ error: "Notification not found." }, { status: 404 });
  return Response.json({ notification });
}
