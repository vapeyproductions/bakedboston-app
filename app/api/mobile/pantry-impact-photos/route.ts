import { createHash } from "crypto";
import { put } from "@vercel/blob";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { mobileSessions, pantries, pantryImpactPhotos, partnerAccounts, rescueRoutes } from "../../../../db/schema";
import { writeAudit } from "../../../audit";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 4 * 1024 * 1024;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

async function currentPantry(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const db = getDb();
  const [session] = await db.select().from(mobileSessions).where(and(eq(mobileSessions.tokenHash, tokenHash(token)), gt(mobileSessions.expiresAt, new Date()))).limit(1);
  if (!session || session.role !== "pantry") return null;
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, session.accountId)).limit(1);
  return account?.active && account.organizationType === "pantry" ? account : null;
}

export async function POST(request: Request) {
  try {
    const account = await currentPantry(request);
    if (!account) return Response.json({ error: "Pantry account access is required." }, { status: 401 });
    const directUpload = request.headers.get("x-bakedboston-upload") === "pantry-impact";
    const form = directUpload ? null : await request.formData();
    const rescueRouteId = Number(directUpload ? request.headers.get("x-rescue-route-id") : form?.get("rescueRouteId"));
    const photo = directUpload
      ? new File([await request.arrayBuffer()], request.headers.get("x-file-name") || `impact-photo-${rescueRouteId}.jpg`, { type: request.headers.get("content-type") || "image/jpeg" })
      : form?.get("photo");
    const socialConsent = directUpload ? request.headers.get("x-social-consent") : form?.get("socialConsent");
    const caption = directUpload ? decodeURIComponent(request.headers.get("x-impact-caption") || "") : String(form?.get("caption") ?? "").trim();
    if (!Number.isInteger(rescueRouteId) || rescueRouteId < 1) return Response.json({ error: "Choose a completed delivery." }, { status: 400 });
    if (socialConsent !== "true") return Response.json({ error: "Confirm consent before sharing an impact photo." }, { status: 400 });
    if (!(photo instanceof File)) return Response.json({ error: "Choose a photo to upload." }, { status: 400 });
    if (!allowedTypes.has(photo.type)) return Response.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
    if (photo.size > maxBytes) return Response.json({ error: "Photos must be 4 MB or smaller." }, { status: 400 });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "Photo storage is not connected yet." }, { status: 503 });
    const db = getDb();
    const [pantry] = await db.select().from(pantries).where(eq(pantries.id, account.organizationId)).limit(1);
    const [route] = pantry ? await db.select().from(rescueRoutes).where(and(eq(rescueRoutes.id, rescueRouteId), eq(rescueRoutes.pantryName, pantry.name), eq(rescueRoutes.status, "completed"))).limit(1) : [];
    if (!pantry || !route) return Response.json({ error: "Impact photos can only be added to completed deliveries for your pantry." }, { status: 409 });
    const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const blob = await put(`pantry-impact/${pantry.id}/${route.id}/${safeName}`, photo, { access: "public", addRandomSuffix: true });
    const [record] = await db.insert(pantryImpactPhotos).values({ pantryId: pantry.id, rescueRouteId: route.id, imageUrl: blob.url, pathname: blob.pathname, caption, socialConsent: true }).returning();
    await writeAudit({ actorType: "partner", actorId: account.id, actorName: account.administratorName, action: "shared pantry delivery impact photo", entityType: "pantry", entityId: pantry.id, entityName: pantry.name, details: `Route #${route.id} · consent recorded` });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not upload the impact photo." }, { status: 400 });
  }
}
