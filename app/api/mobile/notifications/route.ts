import { createHash } from "crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeryPickupOccurrences, inAppNotifications, mobileSessions, partnerAccounts } from "../../../../db/schema";
import { markPickupReady } from "../../../pickup-readiness";

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
