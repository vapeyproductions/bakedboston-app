import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { inAppNotifications, partnerAccounts } from "../../../../db/schema";
import { getPartnerAccountId } from "../../../partner-auth";
import { markPickupReady } from "../../../pickup-readiness";
import { recordBakeryHandoff } from "../../../bakery-handoffs";

async function currentRecipient() {
  const accountId = await getPartnerAccountId();
  if (!accountId) return null;
  const [account] = await getDb().select().from(partnerAccounts).where(and(
    eq(partnerAccounts.id, accountId),
    eq(partnerAccounts.active, true),
  )).limit(1);
  return account ? { type: account.organizationType, id: account.organizationId } : null;
}

export async function GET() {
  const recipient = await currentRecipient();
  if (!recipient) return Response.json({ error: "Sign in required." }, { status: 401 });
  const notifications = await getDb().select().from(inAppNotifications).where(and(
    eq(inAppNotifications.recipientType, recipient.type),
    eq(inAppNotifications.recipientId, recipient.id),
  )).orderBy(desc(inAppNotifications.createdAt)).limit(100);
  return Response.json({ notifications });
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
