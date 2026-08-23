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

export type OptimizerSolverMetadata = {
  backend: string;
  status: string;
  candidateCount: number;
  matchedCount?: number;
  routeQuality?: number;
  runtimeSeconds?: number;
  mipGap?: number | null;
};

export type OptimizedAssignment = OptimizedRoute & {
  requestId: number;
  driverId: number;
};

const optimizerEndpoint = () => `${(process.env.OPTIMIZER_BASE_URL ?? "https://bakedboston-optimizer.vercel.app").replace(/\/$/, "")}/api/recommendations`;

export async function requestOptimizedRoutes(input: {
  earliestStart: Date;
  latestFinish: Date;
  startLocation: Coordinates;
  preferredDestination?: Coordinates | null;
}): Promise<OptimizedRoute[] | null> {
  const apiKey = process.env.OPTIMIZER_API_KEY;
  if (!apiKey) {
    console.error("[optimizer] OPTIMIZER_API_KEY is not configured.");
    return null;
  }
  try {
    const response = await fetch(optimizerEndpoint(), {
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
    if (!response.ok) {
      console.error(`[optimizer] Route ranking failed with HTTP ${response.status}.`);
      return null;
    }
    const data = await response.json() as {
      routes?: OptimizedRoute[];
      solver?: OptimizerSolverMetadata;
    };
    if (!data.solver || data.solver.backend !== "gurobi") {
      console.error(`[optimizer] Rejected non-Gurobi route backend: ${data.solver?.backend ?? "missing"}.`);
      return null;
    }
    return Array.isArray(data.routes) ? data.routes : [];
  } catch (error) {
    console.error("[optimizer] Route ranking request failed.", error);
    return null;
  }
}

export async function requestNetworkAssignments(input: {
  serviceDate?: string;
} = {}): Promise<{ assignments: OptimizedAssignment[]; solver: OptimizerSolverMetadata } | null> {
  const apiKey = process.env.OPTIMIZER_API_KEY;
  if (!apiKey) {
    console.error("[optimizer] OPTIMIZER_API_KEY is not configured.");
    return null;
  }
  try {
    const response = await fetch(optimizerEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "network_assignments",
        serviceDate: input.serviceDate ?? null,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      console.error(`[optimizer] Network assignment failed with HTTP ${response.status}.`);
      return null;
    }
    const data = await response.json() as {
      assignments?: OptimizedAssignment[];
      solver?: OptimizerSolverMetadata;
    };
    if (!Array.isArray(data.assignments) || !data.solver) return null;
    if (data.solver.backend !== "gurobi") {
      console.error(`[optimizer] Rejected non-Gurobi assignment backend: ${data.solver.backend}.`);
      return null;
    }
    return { assignments: data.assignments, solver: data.solver };
  } catch (error) {
    console.error("[optimizer] Network assignment request failed.", error);
    return null;
  }
}
