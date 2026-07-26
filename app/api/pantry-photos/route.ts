import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { pantryAccessPhotos, partnerAccounts } from "../../../db/schema";
import { getAdministrator } from "../../admin-auth";
import { writeAudit } from "../../audit";
import { getPartnerAccountId } from "../../partner-auth";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 4 * 1024 * 1024;

async function accessForPantry(requestedPantryId?: number) {
  const administrator = await getAdministrator();
  if (administrator && requestedPantryId) {
    return { pantryId: requestedPantryId, actorType: "admin" as const, actorId: administrator.id, actorName: administrator.displayName };
  }
  const accountId = await getPartnerAccountId();
  if (!accountId) return null;
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account || account.organizationType !== "pantry") return null;
  return { pantryId: account.organizationId, actorType: "partner" as const, actorId: account.id, actorName: account.administratorName };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const requestedPantryId = Number(form.get("pantryId"));
    const access = await accessForPantry(Number.isInteger(requestedPantryId) && requestedPantryId > 0 ? requestedPantryId : undefined);
    if (!access) return Response.json({ error: "Pantry administrator access is required." }, { status: 401 });
    const photo = form.get("photo");
    if (!(photo instanceof File)) return Response.json({ error: "Choose a photo to upload." }, { status: 400 });
    if (!allowedTypes.has(photo.type)) return Response.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
    if (photo.size > maxBytes) return Response.json({ error: "Photos must be 4 MB or smaller." }, { status: 400 });
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json({ error: "Photo storage is not connected yet. Add a Vercel Blob store to this project, then try again." }, { status: 503 });
    }
    const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const blob = await put(`pantry-access/${access.pantryId}/${safeName}`, photo, { access: "public", addRandomSuffix: true });
    const db = getDb();
    const [record] = await db.insert(pantryAccessPhotos).values({
      pantryId: access.pantryId,
      imageUrl: blob.url,
      pathname: blob.pathname,
      caption: String(form.get("caption") ?? "").trim(),
    }).returning();
    await writeAudit({ actorType: access.actorType, actorId: access.actorId, actorName: access.actorName, action: "added pantry access photo", entityType: "pantry", entityId: access.pantryId, entityName: "", details: record.caption });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not upload photo." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "A valid photo is required." }, { status: 400 });
  const db = getDb();
  const [photo] = await db.select().from(pantryAccessPhotos).where(eq(pantryAccessPhotos.id, id)).limit(1);
  if (!photo) return Response.json({ error: "Photo not found." }, { status: 404 });
  const access = await accessForPantry(photo.pantryId);
  if (!access || access.pantryId !== photo.pantryId) return Response.json({ error: "You cannot delete this photo." }, { status: 403 });
  if (process.env.BLOB_READ_WRITE_TOKEN) await del(photo.imageUrl);
  await db.delete(pantryAccessPhotos).where(eq(pantryAccessPhotos.id, id));
  await writeAudit({ actorType: access.actorType, actorId: access.actorId, actorName: access.actorName, action: "deleted pantry access photo", entityType: "pantry", entityId: photo.pantryId, entityName: "", details: photo.caption });
  return Response.json({ ok: true });
}
