import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, pantries } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { writeAudit } from "../../../audit";

export async function PATCH(request: Request) {
  const actor = await getAdministrator();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const organizationType = String(body.organizationType ?? "");
  const organizationId = Number(body.organizationId);
  const action = String(body.action ?? "");
  if (!["bakery", "pantry"].includes(organizationType) || !Number.isInteger(organizationId) || organizationId < 1) {
    return Response.json({ error: "A valid organization is required." }, { status: 400 });
  }
  if (action !== "accept_standardized") {
    return Response.json({ error: "Unknown address review action." }, { status: 400 });
  }

  const db = getDb();
  const table = organizationType === "bakery" ? bakeries : pantries;
  const [existing] = await db.select().from(table).where(eq(table.id, organizationId)).limit(1);
  if (!existing) return Response.json({ error: "Organization not found." }, { status: 404 });
  if (!existing.formattedAddress || !existing.googlePlaceId || existing.latitude === null || existing.longitude === null) {
    return Response.json({ error: "Google did not return enough location information to confirm this address." }, { status: 409 });
  }

  const [record] = await db.update(table).set({
    address: existing.formattedAddress,
    addressValidationStatus: "validated",
  }).where(eq(table.id, organizationId)).returning();

  await writeAudit({
    actorType: "admin",
    actorId: actor.id,
    actorName: actor.displayName,
    action: "confirmed standardized organization address",
    entityType: organizationType,
    entityId: organizationId,
    entityName: existing.name,
    details: `${existing.address} → ${existing.formattedAddress}`,
  });
  return Response.json({ record });
}
