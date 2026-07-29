type Coordinates = { latitude: number; longitude: number };

export type OptimizedRoute = {
  pickupId: number;
  pantryId: number;
  bakeryName: string;
  pantryName: string;
  pantryServiceMode: "staffed" | "unattended";
  departAt: string;
  pickupAt: string;
  pantryArrivalAt: string;
  finishAt: string;
  driveMinutes: number;
  waitingMinutes: number;
  pantryPriority: number;
  score: number;
  explanation: string[];
};

export async function requestOptimizedRoutes(input: {
  earliestStart: Date;
  latestFinish: Date;
  startLocation: Coordinates;
  preferredDestination?: Coordinates | null;
}): Promise<OptimizedRoute[] | null> {
  const apiKey = process.env.OPTIMIZER_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch("https://bakedboston-optimizer.vercel.app/api/recommendations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        earliestStart: input.earliestStart.toISOString(),
        latestFinish: input.latestFinish.toISOString(),
        startLocation: input.startLocation,
        preferredDestination: input.preferredDestination ?? null,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { routes?: OptimizedRoute[] };
    return Array.isArray(data.routes) ? data.routes : [];
  } catch {
    return null;
  }
}
