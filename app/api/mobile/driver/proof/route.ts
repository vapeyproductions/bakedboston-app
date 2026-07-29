import { createHash } from "crypto";
import { put } from "@vercel/blob";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { driverAccounts, mobileSessions, routeOffers } from "../../../../../db/schema";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

async function currentDriver(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const db = getDb();
  const [session] = await db.select().from(mobileSessions).where(and(
    eq(mobileSessions.tokenHash, tokenHash(token)),
    gt(mobileSessions.expiresAt, new Date()),
    eq(mobileSessions.role, "driver"),
  )).limit(1);
  if (!session) return null;
  return (await db.select().from(driverAccounts).where(and(
    eq(driverAccounts.id, session.accountId),
    eq(driverAccounts.active, true),
  )).limit(1))[0] ?? null;
}

export async function POST(request: Request) {
  try {
    const driver = await currentDriver(request);
    if (!driver) return Response.json({ error: "Sign in required." }, { status: 401 });
    const directUpload = request.headers.get("x-bakedboston-upload") === "delivery-proof";
    const form = directUpload ? null : await request.formData();
    const offerId = Number(directUpload ? request.headers.get("x-offer-id") : form?.get("offerId"));
    const photo = directUpload
      ? new File([await request.arrayBuffer()], request.headers.get("x-file-name") || `delivery-${offerId}.jpg`, { type: request.headers.get("content-type") || "image/jpeg" })
      : form?.get("photo");
    if (!Number.isInteger(offerId)) return Response.json({ error: "A delivery is required." }, { status: 400 });
    if (!(photo instanceof File)) return Response.json({ error: "Take a drop-off photo before completing the delivery." }, { status: 400 });
    if (!allowedTypes.has(photo.type) || photo.size > 6 * 1024 * 1024) {
      return Response.json({ error: "Use a JPEG, PNG, or WebP photo up to 6 MB." }, { status: 400 });
    }
    const db = getDb();
    const [offer] = await db.select().from(routeOffers).where(and(
      eq(routeOffers.id, offerId),
      eq(routeOffers.driverId, driver.id),
      eq(routeOffers.status, "accepted"),
      eq(routeOffers.deliveryStage, "arrived_at_pantry"),
      eq(routeOffers.pantryServiceMode, "unattended"),
    )).limit(1);
    if (!offer) return Response.json({ error: "This unattended delivery is not ready for proof." }, { status: 409 });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "Photo storage is not connected." }, { status: 503 });
    const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const blob = await put(`delivery-proof/${offer.id}/${safeName}`, photo, { access: "public", addRandomSuffix: true });
    const [updated] = await db.update(routeOffers).set({
      deliveryProofUrl: blob.url,
      deliveryProofPathname: blob.pathname,
    }).where(eq(routeOffers.id, offer.id)).returning();
    return Response.json({ offer: updated, imageUrl: blob.url });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not upload delivery evidence." }, { status: 400 });
  }
}
