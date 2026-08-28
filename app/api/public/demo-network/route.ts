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
  isClosed?: boolean;
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

type PartnerPoint = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  deliveriesSevenDays?: number;
  postalCode: string;
  type: "Bakery" | "Pantry";
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
    }));

  if (!operationalBakeries.length || !operationalPantries.length) {
    return Response.json({ nodes: [], candidates: [], highlightedRouteId: null, liveRouteLabel: "", liveRouteContext: "" }, {
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

  const loginMinutes = 14 * 60 + 17;
  const preferredStartMinutes = 16 * 60 + 30;
  const preferredFinishMinutes = 17 * 60;
  const requestedWindowMinutes = preferredFinishMinutes - preferredStartMinutes;
  const startRadiusMiles = 2;
  const destinationRadiusMiles = 2;
  const departureOffsets = [-10, -5, -20, -15, -25];

  const rawPairs = operationalBakeries.flatMap((bakery, bakeryIndex) => operationalPantries.map((pantry, pantryIndex) => {
    const distanceMiles = milesBetween(bakery.latitude, bakery.longitude, pantry.latitude, pantry.longitude);
    const driverDistanceMiles = milesBetween(driverLatitude, driverLongitude, bakery.latitude, bakery.longitude);
    const priority = 1 / ((pantry.deliveriesSevenDays ?? 0) + 1);
    const driveMinutes = Math.max(8, (driverDistanceMiles + distanceMiles) * 3.5);
    const departureMinutes = preferredStartMinutes + (departureOffsets[(bakeryIndex + pantryIndex) % departureOffsets.length] ?? -10);
    const pickupMinutes = departureMinutes + Math.max(3, driverDistanceMiles * 3.5);
    const arrivalMinutes = departureMinutes + driveMinutes + 5;
    const finishMinutes = arrivalMinutes + 5;
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
      departureMinutes,
      pickupMinutes,
      arrivalMinutes,
      finishMinutes,
      requestedTimeDeviationMinutes,
      requestedTimeDeviationRatio,
      originDeviationMiles,
      destinationDeviationMiles,
    };
  }));

  const maximumOriginDeviation = Math.max(0, ...rawPairs.map((pair) => pair.originDeviationMiles));
  const maximumDestinationDeviation = Math.max(0, ...rawPairs.map((pair) => pair.destinationDeviationMiles));
  const rankedPairs = rawPairs.map((pair) => {
    const normalizedOriginDeviation = maximumOriginDeviation > 0
      ? pair.originDeviationMiles / maximumOriginDeviation
      : 0;
    const normalizedDestinationDeviation = maximumDestinationDeviation > 0
      ? pair.destinationDeviationMiles / maximumDestinationDeviation
      : 0;
    const normalizedSpatialDeviation = (normalizedOriginDeviation + normalizedDestinationDeviation) / 2;
    const rawScore = 45 * pair.priority
      - pair.driveMinutes
      - 24 * pair.requestedTimeDeviationRatio
      - 18 * normalizedSpatialDeviation;
    return {
      ...pair,
      normalizedOriginDeviation,
      normalizedDestinationDeviation,
      normalizedSpatialDeviation,
      rawScore,
    };
  }).sort((left, right) => right.rawScore - left.rawScore || left.distanceMiles - right.distanceMiles);

  const selectedPairs: typeof rankedPairs = [];
  const usedBakeryIds = new Set<number>();
  const usedPantryIds = new Set<number>();
  const candidateLimit = Math.min(5, rankedPairs.length);

  while (selectedPairs.length < candidateLimit) {
    const remainingPairs = rankedPairs.filter((candidate) => !selectedPairs.includes(candidate));
    const nextPair = remainingPairs.sort((left, right) => {
      const leftCoverage = Number(!usedBakeryIds.has(left.bakery.id)) + Number(!usedPantryIds.has(left.pantry.id));
      const rightCoverage = Number(!usedBakeryIds.has(right.bakery.id)) + Number(!usedPantryIds.has(right.pantry.id));
      return rightCoverage - leftCoverage || right.rawScore - left.rawScore || left.distanceMiles - right.distanceMiles;
    })[0];

    if (!nextPair) break;
    selectedPairs.push(nextPair);
    usedBakeryIds.add(nextPair.bakery.id);
    usedPantryIds.add(nextPair.pantry.id);
  }
  const chosenPair = selectedPairs[0];

  const referencePoints = [
    ...operationalBakeries.map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
    ...operationalPantries.map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
  ];
  const toCanvasPosition = normalizePoints(referencePoints);

  const closedBakeryLatitude = chosenPair.bakery.latitude + 0.04;
  const closedBakeryLongitude = chosenPair.bakery.longitude - 0.07;
  const closedPantryLatitude = chosenPair.pantry.latitude + 0.06;
  const closedPantryLongitude = chosenPair.pantry.longitude - 0.09;

  const driverPosition = toCanvasPosition(driverLatitude, driverLongitude);
  const closedBakeryPosition = toCanvasPosition(closedBakeryLatitude, closedBakeryLongitude);
  const closedPantryPosition = toCanvasPosition(closedPantryLatitude, closedPantryLongitude);

  const actualNodes: DemoNode[] = [
    ...operationalBakeries.map((bakery) => {
      const point = toCanvasPosition(bakery.latitude, bakery.longitude);
      return {
        id: `bakery-${bakery.id}`,
        label: bakery.name,
        type: "Bakery" as const,
        short: "🥖",
        left: point.left,
        top: point.top,
        postalCode: bakery.postalCode,
      };
    }),
    ...operationalPantries.map((pantry) => {
      const point = toCanvasPosition(pantry.latitude, pantry.longitude);
      return {
        id: `pantry-${pantry.id}`,
        label: pantry.name,
        type: "Pantry" as const,
        short: "🥫",
        left: point.left,
        top: point.top,
        postalCode: pantry.postalCode,
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
    {
      id: "closed-bakery",
      label: "North Station Bakes",
      type: "Bakery",
      short: "🥖",
      left: "8%",
      top: "10%",
      isClosed: true,
    },
    {
      id: "closed-pantry",
      label: "Harbor Shelf Pantry",
      type: "Pantry",
      short: "🥫",
      left: "93%",
      top: "90%",
      isClosed: true,
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

  const candidates: CandidateRoute[] = selectedPairs.map(({ bakery, pantry, distanceMiles, driverDistanceMiles, driveMinutes, priority, departureMinutes, pickupMinutes, arrivalMinutes, finishMinutes, requestedTimeDeviationMinutes, requestedTimeDeviationRatio, originDeviationMiles, destinationDeviationMiles, normalizedOriginDeviation, normalizedDestinationDeviation, normalizedSpatialDeviation, rawScore }, index) => {
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
      servedOpportunities: pantry.deliveriesSevenDays ?? 0,
      receivingOpportunities: Math.max(7, (pantry.deliveriesSevenDays ?? 0) + 5),
      originWaitMinutes: Math.max(0, departureMinutes - loginMinutes),
      facilityWaitMinutes: 0,
      requestedTimeDeviationMinutes,
      requestedWindowMinutes,
      requestedTimeDeviationRatio,
      originDeviationMiles,
      destinationDeviationMiles,
      normalizedOriginDeviation,
      normalizedDestinationDeviation,
      normalizedSpatialDeviation,
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
    nodes: actualNodes,
    candidates,
    highlightedRouteId,
    liveRouteLabel: `${chosenPair.bakery.name} → ${chosenPair.pantry.name}`,
    liveRouteContext: featuredCompletedRoute && completedAt
      ? `Based on the most recent completed delivery on ${completedAt}.`
      : "Based on the current registered bakery and pantry network.",
    request,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
