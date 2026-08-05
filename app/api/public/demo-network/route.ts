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
  priority: number;
  waitingPenalty: number;
  destinationPenalty: number;
  points: string;
};

type PartnerPoint = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  deliveriesSevenDays?: number;
  type: "Bakery" | "Pantry";
};

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
      type: "Bakery",
    }));

  const operationalPantries: PartnerPoint[] = pantryRows
    .filter((pantry) => registeredPantryIds.has(pantry.id) && pantry.addressValidationStatus === "validated" && pantry.latitude !== null && pantry.longitude !== null)
    .map((pantry) => ({
      id: pantry.id,
      name: pantry.name,
      latitude: pantry.latitude as number,
      longitude: pantry.longitude as number,
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

  const featuredBakery = featuredCompletedRoute
    ? operationalBakeries.find((item) => item.name === featuredCompletedRoute.bakeryName) ?? operationalBakeries[0]
    : operationalBakeries[0];

  const pantryCandidates = [...operationalPantries]
    .map((pantry) => ({
      pantry,
      distanceMiles: milesBetween(featuredBakery.latitude, featuredBakery.longitude, pantry.latitude, pantry.longitude),
    }))
    .sort((left, right) => left.distanceMiles - right.distanceMiles)
    .slice(0, Math.min(3, operationalPantries.length));

  const highlightedPantry = featuredCompletedRoute
    ? operationalPantries.find((item) => item.name === featuredCompletedRoute.pantryName) ?? pantryCandidates[0]?.pantry
    : pantryCandidates[0]?.pantry;

  const chosenIndex = pantryCandidates.findIndex((candidate) => candidate.pantry.id === highlightedPantry?.id);
  const fallbackChosen = chosenIndex >= 0 ? chosenIndex : 0;

  const referencePoints = [
    ...operationalBakeries.map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
    ...operationalPantries.map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
  ];
  const toCanvasPosition = normalizePoints(referencePoints);

  const driverLatitude = featuredBakery.latitude + ((highlightedPantry?.latitude ?? featuredBakery.latitude) - featuredBakery.latitude) * 0.35 - 0.008;
  const driverLongitude = featuredBakery.longitude + ((highlightedPantry?.longitude ?? featuredBakery.longitude) - featuredBakery.longitude) * 0.25 - 0.01;

  const closedBakeryLatitude = featuredBakery.latitude + 0.028;
  const closedBakeryLongitude = featuredBakery.longitude - 0.05;
  const closedPantryLatitude = (highlightedPantry?.latitude ?? featuredBakery.latitude) - 0.036;
  const closedPantryLongitude = (highlightedPantry?.longitude ?? featuredBakery.longitude) + 0.034;

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
      label: "Closed bakery",
      type: "Bakery",
      short: "🥖",
      left: closedBakeryPosition.left,
      top: closedBakeryPosition.top,
      isClosed: true,
    },
    {
      id: "closed-pantry",
      label: "Closed pantry",
      type: "Pantry",
      short: "🥫",
      left: closedPantryPosition.left,
      top: closedPantryPosition.top,
      isClosed: true,
    },
  ];

  const driverLeft = Number(driverPosition.left.replace("%", ""));
  const driverTop = Number(driverPosition.top.replace("%", ""));

  const candidates: CandidateRoute[] = pantryCandidates.map(({ pantry, distanceMiles }, index) => {
    const pantryPosition = toCanvasPosition(pantry.latitude, pantry.longitude);
    const bakeryPosition = toCanvasPosition(featuredBakery.latitude, featuredBakery.longitude);
    const bakeryLeft = Number(bakeryPosition.left.replace("%", ""));
    const bakeryTop = Number(bakeryPosition.top.replace("%", ""));
    const pantryLeft = Number(pantryPosition.left.replace("%", ""));
    const pantryTop = Number(pantryPosition.top.replace("%", ""));
    const priority = Number((100 / ((pantry.deliveriesSevenDays ?? 0) + 1)).toFixed(1));
    const waitingPenalty = 8 + index * 2;
    const destinationPenalty = 6 + index * 1.5;
    const score = Number((priority - distanceMiles * 7.4 - waitingPenalty - destinationPenalty).toFixed(1));
    return {
      id: `route-${String.fromCharCode(97 + index)}`,
      label: String.fromCharCode(65 + index),
      bakery: featuredBakery.name,
      pantry: pantry.name,
      drive: `${distanceMiles.toFixed(1)} mi`,
      score: score.toFixed(1),
      distanceMiles,
      priority,
      waitingPenalty,
      destinationPenalty,
      points: `${clamp(bakeryLeft, 6, 94)},${clamp(bakeryTop, 6, 94)} ${clamp(driverLeft, 6, 94)},${clamp(driverTop, 6, 94)} ${clamp(pantryLeft, 6, 94)},${clamp(pantryTop, 6, 94)}`,
    };
  });

  const highlightedRouteId = candidates[fallbackChosen]?.id ?? null;
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
    liveRouteLabel: highlightedPantry ? `${featuredBakery.name} → ${highlightedPantry.name}` : featuredBakery.name,
    liveRouteContext: featuredCompletedRoute && completedAt
      ? `Based on the most recent completed delivery on ${completedAt}.`
      : "Based on the current registered bakery and pantry network.",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
