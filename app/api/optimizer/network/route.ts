import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { availabilityPauses, availabilityWindows, bakeries, pantries, partnerAccounts, rescueRoutes, scheduleExceptions } from "../../../../db/schema";

function authorized(request: Request) {
  const expected = process.env.OPTIMIZER_API_KEY ?? "";
  const supplied = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  return Boolean(expected && supplied && expected.length === supplied.length && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)));
}

export async function GET(request: Request) {
  if (!process.env.OPTIMIZER_API_KEY) return Response.json({ error: "Optimizer integration is not configured." }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const db = getDb();
  const [bakeryRows, pantryRows, accounts, windows, pauses, exceptions, routes] = await Promise.all([
    db.select().from(bakeries).where(eq(bakeries.active, true)),
    db.select().from(pantries).where(eq(pantries.active, true)),
    db.select({
      organizationType: partnerAccounts.organizationType,
      organizationId: partnerAccounts.organizationId,
    }).from(partnerAccounts).where(eq(partnerAccounts.active, true)),
    db.select().from(availabilityWindows),
    db.select().from(availabilityPauses),
    db.select().from(scheduleExceptions),
    db.select().from(rescueRoutes),
  ]);
  const registeredBakeries = new Set(accounts.filter((account) => account.organizationType === "bakery").map((account) => account.organizationId));
  const registeredPantries = new Set(accounts.filter((account) => account.organizationType === "pantry").map((account) => account.organizationId));
  const operationalBakeries = bakeryRows.filter((bakery) => registeredBakeries.has(bakery.id));
  const operationalPantries = pantryRows.filter((pantry) => registeredPantries.has(pantry.id));
  const operationalWindows = windows.filter((window) => window.organizationType === "bakery" ? registeredBakeries.has(window.organizationId) : registeredPantries.has(window.organizationId));
  const operationalPauses = pauses.filter((pause) => pause.organizationType === "bakery" ? registeredBakeries.has(pause.organizationId) : registeredPantries.has(pause.organizationId));
  const operationalExceptions = exceptions.filter((exception) => exception.organizationType === "bakery" ? registeredBakeries.has(exception.organizationId) : registeredPantries.has(exception.organizationId));

  return Response.json({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    bakeries: operationalBakeries.map((bakery) => ({
      id: bakery.id,
      name: bakery.name,
      address: bakery.address,
      formattedAddress: bakery.formattedAddress,
      googlePlaceId: bakery.googlePlaceId,
      addressValidationStatus: bakery.addressValidationStatus,
      optimizationEligible: bakery.addressValidationStatus === "validated",
      latitude: bakery.latitude,
      longitude: bakery.longitude,
      recurringDays: bakery.recurringDays,
      readyTime: bakery.readyTime,
      pickupDeadline: bakery.arrivalDeadline,
    })),
    pantries: operationalPantries.map((pantry) => ({
      id: pantry.id,
      name: pantry.name,
      address: pantry.address,
      formattedAddress: pantry.formattedAddress,
      googlePlaceId: pantry.googlePlaceId,
      addressValidationStatus: pantry.addressValidationStatus,
      optimizationEligible: pantry.addressValidationStatus === "validated",
      latitude: pantry.latitude,
      longitude: pantry.longitude,
      recurringDays: pantry.recurringDays,
      openTime: pantry.openTime,
      closeTime: pantry.closeTime,
      latestPermittedArrival: pantry.latestArrival,
      deliveriesSevenDays: pantry.deliveriesSevenDays,
    })),
    availabilityWindows: operationalWindows,
    availabilityPauses: operationalPauses,
    scheduleExceptions: operationalExceptions,
    routes: routes.map((route) => ({
      id: route.id,
      bakeryName: route.bakeryName,
      pantryName: route.pantryName,
      scheduledArrival: route.scheduledArrival,
      status: route.status,
      createdAt: route.createdAt,
    })),
  }, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
