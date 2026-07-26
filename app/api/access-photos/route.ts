import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { bakeryAccessPhotos, pantryAccessPhotos, partnerAccounts } from "../../../db/schema";
import { getAdministrator } from "../../admin-auth";
import { writeAudit } from "../../audit";
import { getPartnerAccountId } from "../../partner-auth";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 4 * 1024 * 1024;

type Kind = "bakery" | "pantry";

async function accessForOrganization(kind?: Kind, requestedOrganizationId?: number) {
  const administrator = await getAdministrator();
  if (administrator && kind && requestedOrganizationId) {
    return { kind, organizationId: requestedOrganizationId, actorType: "admin" as const, actorId: administrator.id, actorName: administrator.displayName };
  }
  const accountId = await getPartnerAccountId();
  if (!accountId) return null;
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account) return null;
  return { kind: account.organizationType, organizationId: account.organizationId, actorType: "partner" as const, actorId: account.id, actorName: account.administratorName };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const requestedOrganizationId = Number(form.get("organizationId"));
    const requestedKind = form.get("organizationType");
    const kind = requestedKind === "bakery" || requestedKind === "pantry" ? requestedKind : undefined;
    const access = await accessForOrganization(kind, Number.isInteger(requestedOrganizationId) && requestedOrganizationId > 0 ? requestedOrganizationId : undefined);
    if (!access) return Response.json({ error: "Organization administrator access is required." }, { status: 401 });
    const photo = form.get("photo");
    if (!(photo instanceof File)) return Response.json({ error: "Choose a photo to upload." }, { status: 400 });
    if (!allowedTypes.has(photo.type)) return Response.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
    if (photo.size > maxBytes) return Response.json({ error: "Photos must be 4 MB or smaller." }, { status: 400 });
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json({ error: "Photo storage is not connected yet. Add a Vercel Blob store to this project, then try again." }, { status: 503 });
    }
    const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const blob = await put(`${access.kind}-access/${access.organizationId}/${safeName}`, photo, { access: "public", addRandomSuffix: true });
    const db = getDb();
    const photoValues = { imageUrl: blob.url, pathname: blob.pathname, caption: String(form.get("caption") ?? "").trim() };
    const [record] = access.kind === "pantry"
      ? await db.insert(pantryAccessPhotos).values({ pantryId: access.organizationId, ...photoValues }).returning()
      : await db.insert(bakeryAccessPhotos).values({ bakeryId: access.organizationId, ...photoValues }).returning();
    await writeAudit({ actorType: access.actorType, actorId: access.actorId, actorName: access.actorName, action: `added ${access.kind} access photo`, entityType: access.kind, entityId: access.organizationId, entityName: "", details: record.caption });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not upload photo." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "A valid photo is required." }, { status: 400 });
  const db = getDb();
  const kindParam = new URL(request.url).searchParams.get("organizationType");
  const kind: Kind = kindParam === "bakery" ? "bakery" : "pantry";
  const [photo] = kind === "pantry"
    ? await db.select().from(pantryAccessPhotos).where(eq(pantryAccessPhotos.id, id)).limit(1)
    : await db.select().from(bakeryAccessPhotos).where(eq(bakeryAccessPhotos.id, id)).limit(1);
  if (!photo) return Response.json({ error: "Photo not found." }, { status: 404 });
  const organizationId = "pantryId" in photo ? photo.pantryId : photo.bakeryId;
  const access = await accessForOrganization(kind, organizationId);
  if (!access || access.kind !== kind || access.organizationId !== organizationId) return Response.json({ error: "You cannot delete this photo." }, { status: 403 });
  if (process.env.BLOB_READ_WRITE_TOKEN) await del(photo.imageUrl);
  if (kind === "pantry") await db.delete(pantryAccessPhotos).where(eq(pantryAccessPhotos.id, id));
  else await db.delete(bakeryAccessPhotos).where(eq(bakeryAccessPhotos.id, id));
  await writeAudit({ actorType: access.actorType, actorId: access.actorId, actorName: access.actorName, action: `deleted ${kind} access photo`, entityType: kind, entityId: organizationId, entityName: "", details: photo.caption });
  return Response.json({ ok: true });
}
