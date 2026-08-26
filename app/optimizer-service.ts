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
  waitUntilDepartureMinutes: number;
  predepartureWaitMinutes: number;
  facilityWaitMinutes: number;
  requestedTimeDeviationMinutes: number;
  withinPreferredWindow: boolean;
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

export type CustomSimulationInput = {
  driversPerDay: number;
  bakeryCount: number;
  pantryCount: number;
  horizonDays: number;
  randomSeed: number;
  maxSimultaneousDrivers: 2 | 3;
};

const optimizerEndpoint = () => `${(process.env.OPTIMIZER_BASE_URL ?? "https://bakedboston-optimizer.vercel.app").replace(/\/$/, "")}/api/recommendations`;

export async function requestOptimizedRoutes(input: {
  earliestStart: Date;
  latestFinish: Date;
  loggedAt?: Date;
  searchUntil?: Date;
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
        loggedAt: (input.loggedAt ?? new Date()).toISOString(),
        searchUntil: (input.searchUntil ?? new Date(input.latestFinish.getTime() + 90 * 60_000)).toISOString(),
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

export async function requestCustomSimulation(input: CustomSimulationInput): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPTIMIZER_API_KEY;
  if (!apiKey) {
    throw new Error("The optimizer service is not configured for custom experiments.");
  }

  const response = await fetch(optimizerEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "custom_experiment",
      days: input.horizonDays,
      driversPerDay: input.driversPerDay,
      bakeryCount: input.bakeryCount,
      pantryCount: input.pantryCount,
      randomSeed: input.randomSeed,
      maxSimultaneousDrivers: input.maxSimultaneousDrivers,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(55_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`The optimizer could not complete this experiment (HTTP ${response.status})${detail ? `: ${detail.slice(0, 180)}` : "."}`);
  }

  const data = await response.json() as Record<string, unknown> & {
    runtime?: { solverBackend?: string };
  };
  if (data.runtime?.solverBackend !== "gurobi") {
    throw new Error("The custom experiment did not run with the required Gurobi backend.");
  }
  return data;
}
