import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, pantries, partnerAccounts, rescueRoutes } from "../../../../db/schema";

type DemoNode = {
  id: string;
  label: string;
  type: "Bakery" | "Pantry" | "Driver";
  short: string;
  left: string;
  top: string;
  postalCode?: string;
  eligibilityLabel?: string;
};

type DemoObjectiveComponents = {
  pantryCoverage: number;
  rawFoodVolume: number;
  rawFoodEvenness: number;
  savedFoodVolume: number;
  savedFoodEvenness: number;
  pantryPriority: number;
  environmentalBenefit: number;
  driverFit: number;
};

type CandidateRoute = {
  id: string;
  label: string;
  bakery: string;
  pantry: string;
  drive: string;
  score: string;
  distanceMiles: number;
  driverDistanceMiles: number;
  driveMinutes: number;
  priority: number;
  servedOpportunities: number;
  receivingOpportunities: number;
  originWaitMinutes: number;
  facilityWaitMinutes: number;
  requestedTimeDeviationMinutes: number;
  requestedWindowMinutes: number;
  requestedTimeDeviationRatio: number;
  originDeviationMiles: number;
  destinationDeviationMiles: number;
  normalizedOriginDeviation: number;
  normalizedDestinationDeviation: number;
  normalizedSpatialDeviation: number;
  rawFoodKg: number;
  usableFoodKg: number;
  usableFraction: number;
  pantryDistributionFraction: number;
  foodSavedKg: number;
  collectedNotDistributedKg: number;
  uncollectedFoodKg: number;
  counterfactualWasteKgCO2e: number;
  routeWasteKgCO2e: number;
  transportKgCO2e: number;
  netEnvironmentalBenefitKgCO2e: number;
  acceptanceProbability: number;
  driverFit: number;
  completedImpactValue: number;
  expectedImpactValue: number;
  objectiveComponents: DemoObjectiveComponents;
  departureLabel: string;
  pickupLabel: string;
  arrivalLabel: string;
  finishLabel: string;
  points: string;
  labelLeft: string;
  labelTop: string;
};

type DemoRequest = {
  loginLabel: string;
  preferredStartLabel: string;
  preferredFinishLabel: string;
  searchUntilLabel: string;
  requestedWindowMinutes: number;
  startLabel: string;
  startZipCode: string;
  startRadiusMiles: number;
  startLeft: string;
  startTop: string;
  destinationLabel: string;
  destinationZipCode: string;
  destinationRadiusMiles: number;
  destinationLeft: string;
  destinationTop: string;
};

type DemoFilterAuditEntry = {
  id: string;
  bakery: string;
  pantry: string;
  status: "feasible" | "rejected";
  reasonCode: "feasible" | "bakery-deadline" | "pantry-latest-arrival" | "pantry-close" | "search-horizon";
  reasonLabel: string;
  detail: string;
};

type PartnerPoint = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  deliveriesSevenDays?: number;
  postalCode: string;
  type: "Bakery" | "Pantry";
  readyMinutes?: number;
  deadlineMinutes?: number;
  openMinutes?: number;
  closeMinutes?: number;
  latestArrivalMinutes?: number;
};

function extractPostalCode(address: string) {
  return address.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5) ?? "Boston area";
}

function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (value: number) => value * (Math.PI / 180);
  const latitudeDelta = toRadians(lat2 - lat1);
  const longitudeDelta = toRadians(lon2 - lon1);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMiles * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatClock(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

const LANDFILL_KG_CO2E_PER_KG = 0.36;
const PIG_FARM_KG_CO2E_PER_KG = -0.12;
const COMPOST_KG_CO2E_PER_KG = 0.00581;
const TRANSPORT_KG_CO2E_PER_TONNE_KM = 0.41947;

function round(value: number, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function deterministicUnit(id: number, salt: number) {
  const mixed = (Math.imul(id + 1, 1_664_525) + Math.imul(salt + 1, 1_013_904_223)) >>> 0;
  return (mixed % 10_000) / 10_000;
}

function firstScheduleMinute(value: string, fallback: number) {
  const parseClock = (clock: string) => {
    const match = clock.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
  };
  try {
    const parsed = JSON.parse(value) as unknown;
    const queue: unknown[] = [parsed];
    while (queue.length) {
      const current = queue.shift();
      if (typeof current === "string") {
        const minute = parseClock(current);
        if (minute !== null) return minute;
      } else if (Array.isArray(current)) queue.push(...current);
      else if (typeof current === "object" && current !== null) queue.push(...Object.values(current));
    }
  } catch {
    const minute = parseClock(value);
    if (minute !== null) return minute;
  }
  return fallback;
}

function bakeryDemoInputs(id: number) {
  const rawFoodKg = round(12 + 14 * deterministicUnit(id, 1), 2);
  const usableFraction = round(0.66 + 0.28 * deterministicUnit(id, 2), 4);
  const landfill = 0.28 + 0.38 * deterministicUnit(id, 3);
  const pigFarm = Math.min(0.42, 0.08 + 0.28 * deterministicUnit(id, 4), 0.9 - landfill);
  const compost = 1 - landfill - pigFarm;
  return { rawFoodKg, usableFraction, landfill, pigFarm, compost };
}

function pantryDemoDistribution(id: number) {
  return round(0.64 + 0.22 * deterministicUnit(id, 5), 4);
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function evenness(values: number[], denominator: number) {
  if (values.length < 2) return 1;
  let gaps = 0;
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) gaps += Math.abs(values[left] - values[right]);
  }
  return clamp(1 - gaps / Math.max(1, (values.length - 1) * denominator), 0, 1);
}

function normalizePoints(points: Array<{ latitude: number; longitude: number }>) {
  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = Math.max(maxLat - minLat, 0.01);
  const lngRange = Math.max(maxLng - minLng, 0.01);

  return (latitude: number, longitude: number) => ({
    left: `${(14 + ((longitude - minLng) / lngRange) * 70).toFixed(1)}%`,
    top: `${(80 - ((latitude - minLat) / latRange) * 56).toFixed(1)}%`,
  });
}

export async function GET() {
  try {
  const db = getDb();
  const [bakeryRows, pantryRows, accountRows, routeRows] = await Promise.all([
    db.select().from(bakeries).where(eq(bakeries.active, true)),
    db.select().from(pantries).where(eq(pantries.active, true)),
    db.select({
      organizationType: partnerAccounts.organizationType,
      organizationId: partnerAccounts.organizationId,
    }).from(partnerAccounts).where(eq(partnerAccounts.active, true)),
    db.select().from(rescueRoutes).where(eq(rescueRoutes.status, "completed")).orderBy(desc(rescueRoutes.createdAt)).limit(25),
  ]);

  const registeredBakeryIds = new Set(accountRows.filter((account) => account.organizationType === "bakery").map((account) => account.organizationId));
  const registeredPantryIds = new Set(accountRows.filter((account) => account.organizationType === "pantry").map((account) => account.organizationId));

  const operationalBakeries: PartnerPoint[] = bakeryRows
    .filter((bakery) => registeredBakeryIds.has(bakery.id) && bakery.addressValidationStatus === "validated" && bakery.latitude !== null && bakery.longitude !== null)
    .map((bakery) => ({
      id: bakery.id,
      name: bakery.name,
      latitude: bakery.latitude as number,
      longitude: bakery.longitude as number,
      postalCode: extractPostalCode(bakery.formattedAddress || bakery.address),
      type: "Bakery",
      readyMinutes: firstScheduleMinute(bakery.readyTime, 16 * 60),
      deadlineMinutes: firstScheduleMinute(bakery.arrivalDeadline, 17 * 60),
    }));

  const operationalPantries: PartnerPoint[] = pantryRows
    .filter((pantry) => registeredPantryIds.has(pantry.id) && pantry.addressValidationStatus === "validated" && pantry.latitude !== null && pantry.longitude !== null)
    .map((pantry) => ({
      id: pantry.id,
      name: pantry.name,
      latitude: pantry.latitude as number,
      longitude: pantry.longitude as number,
      postalCode: extractPostalCode(pantry.formattedAddress || pantry.address),
      deliveriesSevenDays: pantry.deliveriesSevenDays,
      type: "Pantry",
      openMinutes: firstScheduleMinute(pantry.openTime, 16 * 60),
      closeMinutes: firstScheduleMinute(pantry.closeTime, 19 * 60),
      latestArrivalMinutes: firstScheduleMinute(pantry.latestArrival, 18 * 60 + 45),
    }));

  if (!operationalBakeries.length || !operationalPantries.length) {
    return Response.json({ status: "unavailable", nodes: [], candidates: [], highlightedRouteId: null, liveRouteLabel: "", liveRouteContext: "No eligible database partners are available for the walkthrough." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const featuredCompletedRoute = routeRows.find((route) => {
    const bakery = operationalBakeries.find((item) => item.name === route.bakeryName);
    const pantry = operationalPantries.find((item) => item.name === route.pantryName);
    return Boolean(bakery && pantry);
  });

  const anchorBakery = featuredCompletedRoute
    ? operationalBakeries.find((bakery) => bakery.name === featuredCompletedRoute.bakeryName) ?? operationalBakeries[0]
    : operationalBakeries[0];
  const anchorPantry = featuredCompletedRoute
    ? operationalPantries.find((pantry) => pantry.name === featuredCompletedRoute.pantryName) ?? operationalPantries[0]
    : operationalPantries[0];
  const driverLatitude = anchorBakery.latitude + (anchorPantry.latitude - anchorBakery.latitude) * 0.34 - 0.008;
  const driverLongitude = anchorBakery.longitude + (anchorPantry.longitude - anchorBakery.longitude) * 0.26 - 0.01;

  const startRadiusMiles = 2;
  const destinationRadiusMiles = 2;

  const generatedCombinationCount = operationalBakeries.length * operationalPantries.length;
  const evaluateScenario = (
    preferredStartMinutes: number,
    requestedWindowMinutes: number,
    searchExtensionMinutes: number,
  ) => {
    const preferredFinishMinutes = preferredStartMinutes + requestedWindowMinutes;
    const loginMinutes = Math.max(0, preferredStartMinutes - 120);
    const searchUntilMinutes = preferredFinishMinutes + searchExtensionMinutes;
    const evaluations = operationalBakeries.flatMap((bakery) => operationalPantries.map((pantry) => {
      const bakeryToPantryMiles = milesBetween(bakery.latitude, bakery.longitude, pantry.latitude, pantry.longitude);
      const driverDistanceMiles = milesBetween(driverLatitude, driverLongitude, bakery.latitude, bakery.longitude);
      const routeDistanceMiles = driverDistanceMiles + bakeryToPantryMiles;
      const driverToBakeryMinutes = Math.max(3, driverDistanceMiles * 3.5);
      const bakeryToPantryMinutes = Math.max(5, bakeryToPantryMiles * 3.5);
      const driveMinutes = driverToBakeryMinutes + bakeryToPantryMinutes;
      const readyMinutes = bakery.readyMinutes ?? 16 * 60;
      const deadlineMinutes = Math.max(readyMinutes + 30, bakery.deadlineMinutes ?? readyMinutes + 45);
      const pantryOpenMinutes = pantry.openMinutes ?? 16 * 60;
      const pantryCloseMinutes = Math.max(pantryOpenMinutes + 30, pantry.closeMinutes ?? 19 * 60);
      const latestArrivalMinutes = Math.min(pantryCloseMinutes, pantry.latestArrivalMinutes ?? pantryCloseMinutes - 10);
      const departureMinutes = Math.max(loginMinutes, Math.min(preferredStartMinutes, deadlineMinutes - driverToBakeryMinutes));
      const arrivalAtBakeryMinutes = departureMinutes + driverToBakeryMinutes;
      const pickupMinutes = Math.max(readyMinutes, arrivalAtBakeryMinutes);
      const leaveBakeryMinutes = pickupMinutes + 5;
      const unadjustedArrivalMinutes = leaveBakeryMinutes + bakeryToPantryMinutes;
      const arrivalMinutes = Math.max(pantryOpenMinutes, unadjustedArrivalMinutes);
      const finishMinutes = arrivalMinutes + 5;
      const failures: Array<Pick<DemoFilterAuditEntry, "reasonCode" | "reasonLabel" | "detail">> = [];

      if (pickupMinutes > deadlineMinutes) failures.push({
        reasonCode: "bakery-deadline",
        reasonLabel: "Bakery deadline missed",
        detail: `Pickup would occur at ${formatClock(pickupMinutes)}, after the ${formatClock(deadlineMinutes)} deadline.`,
      });
      if (arrivalMinutes > latestArrivalMinutes) failures.push({
        reasonCode: "pantry-latest-arrival",
        reasonLabel: "Pantry arrival missed",
        detail: `Arrival would occur at ${formatClock(arrivalMinutes)}, after the ${formatClock(latestArrivalMinutes)} latest arrival.`,
      });
      if (finishMinutes > pantryCloseMinutes) failures.push({
        reasonCode: "pantry-close",
        reasonLabel: "Pantry closes before service ends",
        detail: `Unloading would finish at ${formatClock(finishMinutes)}, after the ${formatClock(pantryCloseMinutes)} close.`,
      });
      if (finishMinutes > searchUntilMinutes) failures.push({
        reasonCode: "search-horizon",
        reasonLabel: "Driver search horizon exceeded",
        detail: `The trip would finish at ${formatClock(finishMinutes)}, after the ${formatClock(searchUntilMinutes)} hard horizon.`,
      });

      return {
        bakery,
        pantry,
        distanceMiles: routeDistanceMiles,
        driverDistanceMiles,
        driveMinutes,
        facilityWaitMinutes: Math.max(0, pickupMinutes - arrivalAtBakeryMinutes) + Math.max(0, arrivalMinutes - unadjustedArrivalMinutes),
        departureMinutes,
        pickupMinutes,
        arrivalMinutes,
        finishMinutes,
        failures,
      };
    }));

    return {
      preferredStartMinutes,
      preferredFinishMinutes,
      loginMinutes,
      searchUntilMinutes,
      requestedWindowMinutes,
      feasible: evaluations.filter((evaluation) => evaluation.failures.length === 0),
      evaluations,
    };
  };

  const scheduleMinutes = [
    ...operationalBakeries.flatMap((bakery) => [bakery.readyMinutes, bakery.deadlineMinutes]),
    ...operationalPantries.flatMap((pantry) => [pantry.openMinutes, pantry.latestArrivalMinutes, pantry.closeMinutes]),
  ].filter((minute): minute is number => minute !== undefined);
  const candidateStartMinutes = [...new Set([
    ...Array.from({ length: 25 }, (_, index) => 8 * 60 + index * 30),
    ...scheduleMinutes.flatMap((minute) => [minute - 90, minute - 60, minute - 30, minute]),
  ].filter((minute) => minute >= 7 * 60 && minute <= 20 * 60))].sort((left, right) => left - right);
  const scenarioCandidates = candidateStartMinutes.flatMap((preferredStartMinutes) =>
    [90, 120, 150].flatMap((requestedWindowMinutes) =>
      [60, 90, 120].map((searchExtensionMinutes) =>
        evaluateScenario(preferredStartMinutes, requestedWindowMinutes, searchExtensionMinutes))));
  const desiredFeasibleCount = Math.min(5, Math.max(3, Math.ceil(generatedCombinationCount / 2)));
  const minimumDemonstrativeCount = Math.min(3, generatedCombinationCount);
  const anchorStartMinutes = anchorBakery.readyMinutes ?? 16 * 60 + 30;
  const scenarioQuality = (scenario: ReturnType<typeof evaluateScenario>) => {
    const feasibleCount = scenario.feasible.length;
    const reasonDiversity = new Set(scenario.evaluations.flatMap((evaluation) => evaluation.failures.map((failure) => failure.reasonCode))).size;
    const facilityDiversity = new Set(scenario.feasible.flatMap((evaluation) => [`b-${evaluation.bakery.id}`, `p-${evaluation.pantry.id}`])).size;
    const demonstrative = feasibleCount >= minimumDemonstrativeCount && feasibleCount < generatedCombinationCount;
    return {
      demonstrative: Number(demonstrative),
      targetDistance: Math.abs(feasibleCount - desiredFeasibleCount),
      reasonDiversity,
      facilityDiversity,
      anchorDistance: Math.abs(scenario.preferredStartMinutes - anchorStartMinutes),
      feasibleCount,
    };
  };
  const chosenScenario = scenarioCandidates.sort((left, right) => {
    const leftQuality = scenarioQuality(left);
    const rightQuality = scenarioQuality(right);
    return rightQuality.demonstrative - leftQuality.demonstrative
      || leftQuality.targetDistance - rightQuality.targetDistance
      || rightQuality.reasonDiversity - leftQuality.reasonDiversity
      || rightQuality.facilityDiversity - leftQuality.facilityDiversity
      || rightQuality.feasibleCount - leftQuality.feasibleCount
      || leftQuality.anchorDistance - rightQuality.anchorDistance;
  })[0];
  const {
    preferredStartMinutes,
    preferredFinishMinutes,
    loginMinutes,
    requestedWindowMinutes,
  } = chosenScenario;
  const filterAudit: DemoFilterAuditEntry[] = chosenScenario.evaluations.map((evaluation) => {
    const failure = evaluation.failures[0];
    return failure ? {
      id: `pair-${evaluation.bakery.id}-${evaluation.pantry.id}`,
      bakery: evaluation.bakery.name,
      pantry: evaluation.pantry.name,
      status: "rejected",
      ...failure,
    } : {
      id: `pair-${evaluation.bakery.id}-${evaluation.pantry.id}`,
      bakery: evaluation.bakery.name,
      pantry: evaluation.pantry.name,
      status: "feasible",
      reasonCode: "feasible",
      reasonLabel: "Retained for impact scoring",
      detail: `Pickup ${formatClock(evaluation.pickupMinutes)} · pantry arrival ${formatClock(evaluation.arrivalMinutes)} · finish ${formatClock(evaluation.finishMinutes)}.`,
    };
  });

  const rawPairs = chosenScenario.feasible.map((timing) => {
    const { bakery, pantry, distanceMiles, driverDistanceMiles, driveMinutes, facilityWaitMinutes, departureMinutes, pickupMinutes, arrivalMinutes, finishMinutes } = timing;
    const deliveries = pantry.deliveriesSevenDays ?? 0;
    const receivingOpportunities = Math.max(7, deliveries + 5);
    const priority = 1 - (deliveries + 1) / (receivingOpportunities + 2);
    const bakeryInputs = bakeryDemoInputs(bakery.id);
    const pantryDistributionFraction = pantryDemoDistribution(pantry.id);
    const usableFoodKg = bakeryInputs.rawFoodKg * bakeryInputs.usableFraction;
    const foodSavedKg = usableFoodKg * pantryDistributionFraction;
    const collectedNotDistributedKg = bakeryInputs.rawFoodKg - foodSavedKg;
    const pathwayCoefficient = bakeryInputs.landfill * LANDFILL_KG_CO2E_PER_KG
      + bakeryInputs.pigFarm * PIG_FARM_KG_CO2E_PER_KG
      + bakeryInputs.compost * COMPOST_KG_CO2E_PER_KG;
    const counterfactualWasteKgCO2e = bakeryInputs.rawFoodKg * pathwayCoefficient;
    const routeWasteKgCO2e = collectedNotDistributedKg * pathwayCoefficient;
    const transportKgCO2e = TRANSPORT_KG_CO2E_PER_TONNE_KM * (bakeryInputs.rawFoodKg / 1000) * (distanceMiles * 1.60934);
    const netEnvironmentalBenefitKgCO2e = counterfactualWasteKgCO2e - routeWasteKgCO2e - transportKgCO2e;
    const requestedTimeDeviationMinutes = Math.max(0, preferredStartMinutes - departureMinutes)
      + Math.max(0, finishMinutes - preferredFinishMinutes);
    const requestedTimeDeviationRatio = requestedTimeDeviationMinutes / requestedWindowMinutes;
    const originDeviationMiles = Math.max(0, milesBetween(
      bakery.latitude,
      bakery.longitude,
      anchorBakery.latitude,
      anchorBakery.longitude,
    ) - startRadiusMiles);
    const destinationDeviationMiles = Math.max(0, milesBetween(
      pantry.latitude,
      pantry.longitude,
      anchorPantry.latitude,
      anchorPantry.longitude,
    ) - destinationRadiusMiles);
    return {
      bakery,
      pantry,
      distanceMiles,
      driverDistanceMiles,
      driveMinutes,
      priority,
      servedOpportunities: deliveries,
      receivingOpportunities,
      facilityWaitMinutes,
      departureMinutes,
      pickupMinutes,
      arrivalMinutes,
      finishMinutes,
      rawFoodKg: bakeryInputs.rawFoodKg,
      usableFraction: bakeryInputs.usableFraction,
      usableFoodKg,
      pantryDistributionFraction,
      foodSavedKg,
      collectedNotDistributedKg,
      counterfactualWasteKgCO2e,
      routeWasteKgCO2e,
      transportKgCO2e,
      netEnvironmentalBenefitKgCO2e,
      historicalRawFoodKg: deliveries * (14 + 5 * deterministicUnit(pantry.id, 6)),
      historicalSavedFoodKg: deliveries * (9 + 4 * deterministicUnit(pantry.id, 7)),
      requestedTimeDeviationMinutes,
      requestedTimeDeviationRatio,
      originDeviationMiles,
      destinationDeviationMiles,
    };
  });

  if (!rawPairs.length) {
    return Response.json({ status: "unavailable", nodes: [], candidates: [], highlightedRouteId: null, liveRouteLabel: "", liveRouteContext: "The database partners do not produce a feasible one-driver demonstration window." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const maximumOriginDeviation = Math.max(0, ...rawPairs.map((pair) => pair.originDeviationMiles));
  const maximumDestinationDeviation = Math.max(0, ...rawPairs.map((pair) => pair.destinationDeviationMiles));
  const normalizedPairs = rawPairs.map((pair) => {
    const normalizedOriginDeviation = maximumOriginDeviation > 0
      ? pair.originDeviationMiles / maximumOriginDeviation
      : 0;
    const normalizedDestinationDeviation = maximumDestinationDeviation > 0
      ? pair.destinationDeviationMiles / maximumDestinationDeviation
      : 0;
    const normalizedSpatialDeviation = (normalizedOriginDeviation + normalizedDestinationDeviation) / 2;
    const acceptanceProbability = clamp(sigmoid(2.2 - 0.045 * pair.driveMinutes - 1.8 * pair.requestedTimeDeviationRatio - 1.1 * normalizedSpatialDeviation), 0.02, 0.98);
    return {
      ...pair,
      normalizedOriginDeviation,
      normalizedDestinationDeviation,
      normalizedSpatialDeviation,
      acceptanceProbability,
    };
  });

  const uniqueBakeryFood = new Map<number, number>();
  const uniqueBakerySaved = new Map<number, number>();
  const pantryHistory = new Map<number, { raw: number; saved: number }>();
  for (const pair of normalizedPairs) {
    uniqueBakeryFood.set(pair.bakery.id, pair.rawFoodKg);
    uniqueBakerySaved.set(pair.bakery.id, Math.max(uniqueBakerySaved.get(pair.bakery.id) ?? 0, pair.foodSavedKg));
    pantryHistory.set(pair.pantry.id, { raw: pair.historicalRawFoodKg, saved: pair.historicalSavedFoodKg });
  }
  const rawCapacity = Math.max(1, [...uniqueBakeryFood.values()].reduce((sum, value) => sum + value, 0));
  const savedCapacity = Math.max(1, [...uniqueBakerySaved.values()].reduce((sum, value) => sum + value, 0));
  const historyRaw = [...pantryHistory.values()].reduce((sum, value) => sum + value.raw, 0);
  const historySaved = [...pantryHistory.values()].reduce((sum, value) => sum + value.saved, 0);
  const pantryIds = [...pantryHistory.keys()];
  const environmentValues = normalizedPairs.map((pair) => pair.netEnvironmentalBenefitKgCO2e);
  const environmentMinimum = Math.min(...environmentValues);
  const environmentSpan = Math.max(...environmentValues) - environmentMinimum;
  const maximumDriveMinutes = Math.max(1, ...normalizedPairs.map((pair) => pair.driveMinutes));
  const rankedPairs = normalizedPairs.map((pair) => {
    const rawTotals = pantryIds.map((id) => (pantryHistory.get(id)?.raw ?? 0) + (id === pair.pantry.id ? pair.rawFoodKg : 0));
    const savedTotals = pantryIds.map((id) => (pantryHistory.get(id)?.saved ?? 0) + (id === pair.pantry.id ? pair.foodSavedKg : 0));
    const driverFit = clamp(1 - (Math.min(1, pair.driveMinutes / maximumDriveMinutes) + Math.min(1, pair.requestedTimeDeviationRatio) + Math.min(1, pair.normalizedSpatialDeviation)) / 3, 0, 1);
    const objectiveComponents: DemoObjectiveComponents = {
      pantryCoverage: 1 / Math.max(1, pantryIds.length),
      rawFoodVolume: pair.rawFoodKg / rawCapacity,
      rawFoodEvenness: evenness(rawTotals, historyRaw + rawCapacity),
      savedFoodVolume: pair.foodSavedKg / savedCapacity,
      savedFoodEvenness: evenness(savedTotals, historySaved + savedCapacity),
      pantryPriority: pair.priority,
      environmentalBenefit: environmentSpan > 1e-9 ? (pair.netEnvironmentalBenefitKgCO2e - environmentMinimum) / environmentSpan : 0.5,
      driverFit,
    };
    const completedImpactValue = 10 * objectiveComponents.pantryCoverage
      + 10 * objectiveComponents.rawFoodVolume
      + 10 * objectiveComponents.rawFoodEvenness
      + 10 * objectiveComponents.savedFoodVolume
      + 10 * objectiveComponents.savedFoodEvenness
      + 10 * objectiveComponents.pantryPriority
      + 20 * objectiveComponents.environmentalBenefit
      + 20 * objectiveComponents.driverFit;
    const expectedImpactValue = pair.acceptanceProbability * completedImpactValue;
    return { ...pair, driverFit, objectiveComponents, completedImpactValue, expectedImpactValue, rawScore: expectedImpactValue };
  }).sort((left, right) => right.expectedImpactValue - left.expectedImpactValue || right.completedImpactValue - left.completedImpactValue);

  const chosenPair = rankedPairs[0];

  const selectedPairs: typeof rankedPairs = [chosenPair];
  const usedBakeryIds = new Set<number>([chosenPair.bakery.id]);
  const usedPantryIds = new Set<number>([chosenPair.pantry.id]);
  const candidateLimit = Math.min(5, rankedPairs.length);

  while (selectedPairs.length < candidateLimit) {
    const remainingPairs = rankedPairs.filter((candidate) => !selectedPairs.includes(candidate));
    const nextPair = remainingPairs.sort((left, right) => {
      const leftCoverage = Number(!usedBakeryIds.has(left.bakery.id)) + Number(!usedPantryIds.has(left.pantry.id));
      const rightCoverage = Number(!usedBakeryIds.has(right.bakery.id)) + Number(!usedPantryIds.has(right.pantry.id));
      return rightCoverage - leftCoverage || right.expectedImpactValue - left.expectedImpactValue || right.completedImpactValue - left.completedImpactValue;
    })[0];

    if (!nextPair) break;
    selectedPairs.push(nextPair);
    usedBakeryIds.add(nextPair.bakery.id);
    usedPantryIds.add(nextPair.pantry.id);
  }

  const displayedBakeryIds = new Set(selectedPairs.map((pair) => pair.bakery.id));
  const displayedPantryIds = new Set(selectedPairs.map((pair) => pair.pantry.id));
  const displayedBakeries = operationalBakeries.filter((item) => displayedBakeryIds.has(item.id));
  const displayedPantries = operationalPantries.filter((item) => displayedPantryIds.has(item.id));
  const referencePoints = [
    ...displayedBakeries.map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
    ...displayedPantries.map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
    { latitude: anchorBakery.latitude, longitude: anchorBakery.longitude },
    { latitude: anchorPantry.latitude, longitude: anchorPantry.longitude },
    { latitude: driverLatitude, longitude: driverLongitude },
  ];
  const toCanvasPosition = normalizePoints(referencePoints);

  const driverPosition = toCanvasPosition(driverLatitude, driverLongitude);

  const actualNodes: DemoNode[] = [
    ...displayedBakeries.map((bakery) => {
      const point = toCanvasPosition(bakery.latitude, bakery.longitude);
      return {
        id: `bakery-${bakery.id}`,
        label: bakery.name,
        type: "Bakery" as const,
        short: "🥖",
        left: point.left,
        top: point.top,
        postalCode: bakery.postalCode,
        eligibilityLabel: "registered + validated",
      };
    }),
    ...displayedPantries.map((pantry) => {
      const point = toCanvasPosition(pantry.latitude, pantry.longitude);
      return {
        id: `pantry-${pantry.id}`,
        label: pantry.name,
        type: "Pantry" as const,
        short: "🥫",
        left: point.left,
        top: point.top,
        postalCode: pantry.postalCode,
        eligibilityLabel: "registered + validated",
      };
    }),
    {
      id: "driver-request",
      label: "Driver request",
      type: "Driver",
      short: "🚗",
      left: driverPosition.left,
      top: driverPosition.top,
    },
  ];

  const driverLeft = Number(driverPosition.left.replace("%", ""));
  const driverTop = Number(driverPosition.top.replace("%", ""));

  const labelOffsets = [
    { x: -4, y: -10 },
    { x: 0, y: 2 },
    { x: 4, y: 10 },
    { x: -7, y: 7 },
    { x: 7, y: -7 },
  ];

  const candidates: CandidateRoute[] = selectedPairs.map((pair, index) => {
    const { bakery, pantry, distanceMiles, driverDistanceMiles, driveMinutes, priority, servedOpportunities, receivingOpportunities, facilityWaitMinutes, departureMinutes, pickupMinutes, arrivalMinutes, finishMinutes, rawFoodKg, usableFoodKg, usableFraction, pantryDistributionFraction, foodSavedKg, collectedNotDistributedKg, counterfactualWasteKgCO2e, routeWasteKgCO2e, transportKgCO2e, netEnvironmentalBenefitKgCO2e, acceptanceProbability, driverFit, completedImpactValue, expectedImpactValue, objectiveComponents, requestedTimeDeviationMinutes, requestedTimeDeviationRatio, originDeviationMiles, destinationDeviationMiles, normalizedOriginDeviation, normalizedDestinationDeviation, normalizedSpatialDeviation, rawScore } = pair;
    const pantryPosition = toCanvasPosition(pantry.latitude, pantry.longitude);
    const bakeryPosition = toCanvasPosition(bakery.latitude, bakery.longitude);
    const bakeryLeft = Number(bakeryPosition.left.replace("%", ""));
    const bakeryTop = Number(bakeryPosition.top.replace("%", ""));
    const pantryLeft = Number(pantryPosition.left.replace("%", ""));
    const pantryTop = Number(pantryPosition.top.replace("%", ""));
    const labelLeft = clamp((bakeryLeft + pantryLeft) / 2 + labelOffsets[index].x, 8, 92);
    const labelTop = clamp((bakeryTop + pantryTop) / 2 + labelOffsets[index].y, 10, 90);
    return {
      id: `route-${String.fromCharCode(97 + index)}`,
      label: String.fromCharCode(65 + index),
      bakery: bakery.name,
      pantry: pantry.name,
      drive: `${distanceMiles.toFixed(1)} mi`,
      score: rawScore.toFixed(1),
      distanceMiles,
      driverDistanceMiles,
      driveMinutes,
      priority,
      servedOpportunities,
      receivingOpportunities,
      originWaitMinutes: Math.max(0, departureMinutes - loginMinutes),
      facilityWaitMinutes,
      requestedTimeDeviationMinutes,
      requestedWindowMinutes,
      requestedTimeDeviationRatio,
      originDeviationMiles,
      destinationDeviationMiles,
      normalizedOriginDeviation,
      normalizedDestinationDeviation,
      normalizedSpatialDeviation,
      rawFoodKg: round(rawFoodKg, 2),
      usableFoodKg: round(usableFoodKg, 2),
      usableFraction,
      pantryDistributionFraction,
      foodSavedKg: round(foodSavedKg, 2),
      collectedNotDistributedKg: round(collectedNotDistributedKg, 2),
      uncollectedFoodKg: round(rawFoodKg, 2),
      counterfactualWasteKgCO2e: round(counterfactualWasteKgCO2e, 4),
      routeWasteKgCO2e: round(routeWasteKgCO2e, 4),
      transportKgCO2e: round(transportKgCO2e, 4),
      netEnvironmentalBenefitKgCO2e: round(netEnvironmentalBenefitKgCO2e, 4),
      acceptanceProbability: round(acceptanceProbability, 4),
      driverFit: round(driverFit, 4),
      completedImpactValue: round(completedImpactValue, 3),
      expectedImpactValue: round(expectedImpactValue, 3),
      objectiveComponents: Object.fromEntries(Object.entries(objectiveComponents).map(([key, value]) => [key, round(value, 4)])) as DemoObjectiveComponents,
      departureLabel: formatClock(departureMinutes),
      pickupLabel: formatClock(pickupMinutes),
      arrivalLabel: formatClock(arrivalMinutes),
      finishLabel: formatClock(finishMinutes),
      points: `${clamp(driverLeft, 6, 94)},${clamp(driverTop, 6, 94)} ${clamp(bakeryLeft, 6, 94)},${clamp(bakeryTop, 6, 94)} ${clamp(pantryLeft, 6, 94)},${clamp(pantryTop, 6, 94)}`,
      labelLeft: `${labelLeft}%`,
      labelTop: `${labelTop}%`,
    };
  });

  const highlightedRouteId = candidates[0]?.id ?? null;
  const startPosition = toCanvasPosition(anchorBakery.latitude, anchorBakery.longitude);
  const destinationPosition = toCanvasPosition(anchorPantry.latitude, anchorPantry.longitude);
  const request: DemoRequest = {
    loginLabel: formatClock(loginMinutes),
    preferredStartLabel: formatClock(preferredStartMinutes),
    preferredFinishLabel: formatClock(preferredFinishMinutes),
    searchUntilLabel: formatClock(chosenScenario.searchUntilMinutes),
    requestedWindowMinutes,
    startLabel: "Requested start area",
    startZipCode: anchorBakery.postalCode,
    startRadiusMiles,
    startLeft: startPosition.left,
    startTop: startPosition.top,
    destinationLabel: "Requested destination area",
    destinationZipCode: anchorPantry.postalCode,
    destinationRadiusMiles,
    destinationLeft: destinationPosition.left,
    destinationTop: destinationPosition.top,
  };
  const completedAt = featuredCompletedRoute?.createdAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }).format(featuredCompletedRoute.createdAt)
    : null;

  return Response.json({
    status: "ready",
    nodes: actualNodes,
    candidates,
    highlightedRouteId,
    liveRouteLabel: `${chosenPair.bakery.name} → ${chosenPair.pantry.name}`,
    liveRouteContext: featuredCompletedRoute && completedAt
      ? `Network orientation is anchored to the most recent completed delivery on ${completedAt}. The reproducible synthetic request clock is chosen to expose both retained and rejected database pairs.`
      : "Partner names and locations come from the current registered, validated database network. The reproducible synthetic request clock is chosen to expose both retained and rejected pairs.",
    databaseSnapshot: {
      bakeriesConsidered: operationalBakeries.length,
      pantriesConsidered: operationalPantries.length,
      generatedCombinations: generatedCombinationCount,
      rejectedCombinations: filterAudit.filter((entry) => entry.status === "rejected").length,
      feasibleCandidates: rankedPairs.length,
    },
    filterAudit,
    request,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
  } catch (error) {
    console.error("Homepage model trace could not read the partner database", error);
    return Response.json({
      status: "unavailable",
      nodes: [],
      candidates: [],
      highlightedRouteId: null,
      liveRouteLabel: "",
      liveRouteContext: "The live partner database is temporarily unavailable.",
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
