import { timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, pantries, partnerAccounts } from "../../../../db/schema";

function authorized(request: Request) {
  const expected = process.env.OPTIMIZER_API_KEY ?? "";
  const supplied = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  return Boolean(expected && supplied && expected.length === supplied.length && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)));
}

export async function PATCH(request: Request) {
  try {
    if (!process.env.OPTIMIZER_API_KEY) return Response.json({ error: "Optimizer integration is not configured." }, { status: 503 });
    if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const organizationType = body.organizationType === "bakery" ? "bakery" : body.organizationType === "pantry" ? "pantry" : null;
    const organizationId = Number(body.organizationId);
    const formattedAddress = String(body.formattedAddress ?? "").trim();
    const googlePlaceId = String(body.googlePlaceId ?? "").trim();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const addressValidationStatus: "validated" | "needs_review" | null = body.addressValidationStatus === "validated" ? "validated" : body.addressValidationStatus === "needs_review" ? "needs_review" : null;
    if (!organizationType || !Number.isInteger(organizationId) || !formattedAddress || !googlePlaceId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !addressValidationStatus) {
      return Response.json({ error: "Invalid location validation result." }, { status: 400 });
    }

    const db = getDb();
    const [registered] = await db.select({ id: partnerAccounts.id }).from(partnerAccounts).where(and(
      eq(partnerAccounts.organizationType, organizationType),
      eq(partnerAccounts.organizationId, organizationId),
      eq(partnerAccounts.active, true),
    )).limit(1);
    if (!registered) return Response.json({ error: "Only registered partners can be address validated." }, { status: 403 });

    const values = { formattedAddress, googlePlaceId, latitude, longitude, addressValidationStatus };
    if (organizationType === "bakery") await db.update(bakeries).set(values).where(and(eq(bakeries.id, organizationId), eq(bakeries.active, true)));
    else await db.update(pantries).set(values).where(and(eq(pantries.id, organizationId), eq(pantries.active, true)));
    return Response.json({ ok: true, organizationType, organizationId });
  } catch (error) {
    console.error("Optimizer location update failed", error);
    return Response.json({ error: "Could not save validated location." }, { status: 500 });
  }
}
