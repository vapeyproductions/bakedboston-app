import { createHash } from "crypto";
import { del, put } from "@vercel/blob";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeryAccessPhotos, mobileSessions, pantryAccessPhotos, partnerAccounts } from "../../../../db/schema";
import { writeAudit } from "../../../audit";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 4 * 1024 * 1024;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

async function account(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const db = getDb();
  const [session] = await db.select().from(mobileSessions).where(and(eq(mobileSessions.tokenHash, tokenHash(token)), gt(mobileSessions.expiresAt, new Date()))).limit(1);
  if (!session || session.role === "driver") return null;
  const [record] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, session.accountId)).limit(1);
  return record?.active ? record : null;
}

export async function POST(request: Request) {
  try {
    const current = await account(request);
    if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File)) return Response.json({ error: "Choose a photo to upload." }, { status: 400 });
    if (!allowedTypes.has(photo.type)) return Response.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
    if (photo.size > maxBytes) return Response.json({ error: "Photos must be 4 MB or smaller." }, { status: 400 });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "Photo storage is not connected." }, { status: 503 });
    const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const blob = await put(`${current.organizationType}-access/${current.organizationId}/${safeName}`, photo, { access: "public", addRandomSuffix: true });
    const values = { imageUrl: blob.url, pathname: blob.pathname, caption: String(form.get("caption") ?? "").trim() };
    const [record] = current.organizationType === "pantry"
      ? await getDb().insert(pantryAccessPhotos).values({ pantryId: current.organizationId, ...values }).returning()
      : await getDb().insert(bakeryAccessPhotos).values({ bakeryId: current.organizationId, ...values }).returning();
    await writeAudit({ actorType: "partner", actorId: current.id, actorName: current.accountEmail, action: `added ${current.organizationType} access photo`, entityType: current.organizationType, entityId: current.organizationId, entityName: "", details: record.caption });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not upload photo." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const current = await account(request);
  if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  const db = getDb();
  const [photo] = current.organizationType === "pantry"
    ? await db.select().from(pantryAccessPhotos).where(eq(pantryAccessPhotos.id, id)).limit(1)
    : await db.select().from(bakeryAccessPhotos).where(eq(bakeryAccessPhotos.id, id)).limit(1);
  if (!photo) return Response.json({ error: "Photo not found." }, { status: 404 });
  const organizationId = "pantryId" in photo ? photo.pantryId : photo.bakeryId;
  if (organizationId !== current.organizationId) return Response.json({ error: "You cannot delete this photo." }, { status: 403 });
  if (process.env.BLOB_READ_WRITE_TOKEN) await del(photo.imageUrl);
  if (current.organizationType === "pantry") await db.delete(pantryAccessPhotos).where(eq(pantryAccessPhotos.id, id));
  else await db.delete(bakeryAccessPhotos).where(eq(bakeryAccessPhotos.id, id));
  await writeAudit({ actorType: "partner", actorId: current.id, actorName: current.accountEmail, action: `deleted ${current.organizationType} access photo`, entityType: current.organizationType, entityId: current.organizationId, entityName: "", details: photo.caption });
  return Response.json({ ok: true });
}
