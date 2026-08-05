import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, pantries } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { writeAudit } from "../../../audit";

type GoogleValidationResult = {
  formattedAddress: string;
  googlePlaceId: string;
  latitude: number;
  longitude: number;
  addressValidationStatus: "validated" | "needs_review";
};

type GoogleValidationResponse =
  | { ok: true; result: GoogleValidationResult }
  | { ok: false; error: string };

async function validateAddressWithGoogle(address: string): Promise<GoogleValidationResponse> {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_ROUTES_API_KEY;
  if (!apiKey) return { ok: false, error: "Google geocoding is not configured on the server." };
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return { ok: false, error: `Google geocoding returned HTTP ${response.status}.` };
    const data = await response.json() as {
      status?: string;
      error_message?: string;
      results?: Array<{
        formatted_address?: string;
        place_id?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    if (data.status !== "OK") {
      const suffix = data.error_message ? ` ${data.error_message}` : "";
      return { ok: false, error: `Google geocoding returned ${data.status}.${suffix}`.trim() };
    }
    const first = data.results?.[0];
    const formattedAddress = first?.formatted_address?.trim() ?? "";
    const googlePlaceId = first?.place_id?.trim() ?? "";
    const latitude = Number(first?.geometry?.location?.lat);
    const longitude = Number(first?.geometry?.location?.lng);
    if (!formattedAddress || !googlePlaceId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, error: "Google returned an incomplete address result." };
    }
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    return {
      ok: true,
      result: {
        formattedAddress,
        googlePlaceId,
        latitude,
        longitude,
        addressValidationStatus: normalize(formattedAddress) === normalize(address) ? "validated" : "needs_review",
      },
    };
  } catch {
    return { ok: false, error: "Google geocoding timed out or could not be reached." };
  }
}

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
  if (!["accept_standardized", "validate_now"].includes(action)) {
    return Response.json({ error: "Unknown address review action." }, { status: 400 });
  }

  const db = getDb();
  const table = organizationType === "bakery" ? bakeries : pantries;
  const [existing] = await db.select().from(table).where(eq(table.id, organizationId)).limit(1);
  if (!existing) return Response.json({ error: "Organization not found." }, { status: 404 });

  if (action === "validate_now") {
    const result = await validateAddressWithGoogle(existing.address);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    const [record] = await db.update(table).set({
      formattedAddress: result.result.formattedAddress,
      googlePlaceId: result.result.googlePlaceId,
      latitude: result.result.latitude,
      longitude: result.result.longitude,
      addressValidationStatus: result.result.addressValidationStatus,
    }).where(eq(table.id, organizationId)).returning();

    await writeAudit({
      actorType: "admin",
      actorId: actor.id,
      actorName: actor.displayName,
      action: "ran address validation",
      entityType: organizationType,
      entityId: organizationId,
      entityName: existing.name,
      details: `${existing.address} → ${result.result.formattedAddress} (${result.result.addressValidationStatus})`,
    });

    return Response.json({ record });
  }

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
