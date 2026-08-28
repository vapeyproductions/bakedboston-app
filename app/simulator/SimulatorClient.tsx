"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import styles from "./simulator.module.css";

type RouteOption = {
  requestId: string;
  driverId: string;
  pickupId: string;
  bakeryName: string;
  pantryWindowId: string;
  pantryName: string;
  departAt: string;
  pickupAt: string;
  pantryArrivalAt: string;
  finishAt: string;
  driveMinutes: number;
  waitingMinutes: number;
  predepartureWaitMinutes: number;
  requestedTimeDeviationMinutes: number;
  requestedWindowMinutes: number;
  requestedTimeDeviationRatio: number;
  withinPreferredWindow: boolean;
  destinationMinutes?: number;
  originDeviationMiles: number;
  destinationDeviationMiles: number;
  normalizedOriginDeviation: number;
  normalizedDestinationDeviation: number;
  normalizedSpatialDeviation: number;
  bakeryPostalCode?: string;
  pantryPostalCode?: string;
  pantryPriority: number;
  routeScore: number;
  acceptanceProbability: number;
  distanceMiles: number;
  totalTripMinutes: number;
  driverStart: Coordinate;
  bakeryLocation: Coordinate;
  pantryLocation: Coordinate;
  recommendationRank: number;
  selected: boolean;
  accepted: boolean;
};

type DriverRecommendation = {
  requestId: string;
  driverId: string;
  routes: RouteOption[];
  selectedRoute: RouteOption | null;
};

type DriverRequestTrace = {
  requestId: string;
  driverId: string;
  loggedAt: string;
  preferredStart: string;
  preferredFinish: string;
  searchUntil: string;
  earliestStart?: string;
  latestFinish?: string;
  hasPreferredDestination: boolean;
  requestedWindowMinutes?: number;
  startLocation?: Coordinate;
  startRadiusMiles?: number;
  preferredDestination?: Coordinate | null;
  destinationRadiusMiles?: number;
  startZipCode?: string;
  destinationZipCode?: string;
};

type DecisionEpoch = {
  decisionEpoch: string;
  requests: DriverRequestTrace[];
  queueSize: number;
  candidateCount: number;
  selectedCount: number;
  driverRecommendations: DriverRecommendation[];
  solver: {
    backend: string;
    status: string;
    candidateCount: number;
    matchedCount: number;
    routeQuality: number;
    runtimeSeconds: number;
    mipGap: number | null;
  };
};

type PickupWindow = {
  pickupId: string;
  bakeryName: string;
  readyAt: string;
  pickupDeadline: string;
};

type PantryWindow = {
  pantryWindowId: string;
  pantryName: string;
  receivingStart: string;
  receivingEnd: string;
  latestPermittedArrival: string;
};

type SimulationDay = {
  serviceDate: string;
  scheduledPickupWindows: number;
  foodAvailablePickups: number;
  openPantryWindows: number;
  driverRequests: number;
  feasibleCandidatesEvaluated: number;
  routesOffered: number;
  routesAccepted: number;
  pickupWindows?: PickupWindow[];
  pantryWindows?: PantryWindow[];
  decisionEpochs: DecisionEpoch[];
};

type PolicyResult = {
  policy: string;
  metrics: Record<string, number | null>;
  days: SimulationDay[];
};

type Coordinate = {
  latitude: number;
  longitude: number;
  postalCode?: string;
  formattedAddress?: string;
};

type MapTooltip = {
  x: number;
  y: number;
  label: string;
};

type NetworkNode = Coordinate & {
  id: string;
  name: string;
  kind: "bakery" | "pantry";
};

type SimulationPayload = {
  disclaimer: string;
  generatedAt: string;
  scenario: {
    seed: number;
    startDate: string;
    horizonDays: number;
    timezone: string;
    matchingIntervalMinutes: number;
    driversPerDay: number;
    maxSimultaneousDrivers: 2 | 3;
    bakeryCount?: number;
    pantryCount?: number;
  };
  runtime: {
    solverBackend: string;
    gurobiVersion: string;
    pythonVersion: string;
  };
  selectionRule: string;
  recommendationAllocation?: {
    bakeryPickupExclusiveAcrossMenus: boolean;
    pantryDestinationsMayRepeat: boolean;
    menuConstruction: string;
    zeroRecommendationRule: string;
  };
  objectiveWeights: Record<string, number>;
  policyMetadata: Record<string, { label: string; description: string }>;
  network: {
    bakeries: NetworkNode[];
    pantries: NetworkNode[];
  };
  metricMethodology?: {
    actualSelection: string;
    acceptanceModel: string;
    comparison: string;
  };
  results: PolicyResult[];
};

type Props = {
  data: unknown;
};

type CustomConfig = {
  driversPerDay: number;
  bakeryCount: number;
  pantryCount: number;
  horizonDays: number;
  randomSeed: number;
  maxSimultaneousDrivers: 2 | 3;
};

const formatClock = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date);
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(`${value}T12:00:00-04:00`));

const score = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
const compactDriver = (driverId: string) => driverId.replace("synthetic-driver-", "Driver ");

const percent = (value: number | null | undefined, digits = 0) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";

const numeric = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";

type ProjectedPoint = { x: number; y: number };

const pointAtRadiusBoundary = (
  center: ProjectedPoint,
  target: ProjectedPoint,
  radius: number,
): ProjectedPoint => {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) return target;
  return {
    x: center.x + (dx / distance) * radius,
    y: center.y + (dy / distance) * radius,
  };
};

type MetricDefinition = {
  key: string;
  label: string;
  explanation: string;
  direction: "higher" | "lower" | "none";
  format: (value: number | null | undefined, result: PolicyResult) => string;
};

type MetricGroup = {
  title: string;
  description: string;
  metrics: MetricDefinition[];
};

const metricGroups: MetricGroup[] = [
  {
    title: "Service completion",
    description: "Whether available bakery surplus actually becomes a completed delivery.",
    metrics: [
      { key: "bakeryPickupCoverage", label: "Bakery pickup coverage", explanation: "Eligible food-ready pickup occurrences completed.", direction: "higher", format: (value) => percent(value) },
      { key: "completedDeliveries", label: "Completed deliveries", explanation: "Successful bakery-to-pantry deliveries.", direction: "higher", format: (value) => numeric(value, 0) },
      { key: "unservedPickups", label: "Unserved pickups", explanation: "Food-ready bakery windows that expired without assignment.", direction: "lower", format: (value) => numeric(value, 0) },
    ],
  },
  {
    title: "Pantry reach and fairness",
    description: "How broadly and evenly deliveries are distributed across available pantries.",
    metrics: [
      {
        key: "pantryCoverageCount",
        label: "Pantry coverage",
        explanation: "Unique pantries served, with the share of available pantries in parentheses.",
        direction: "higher",
        format: (value, result) => `${numeric(value, 0)} (${percent(result.metrics.pantryCoveragePercentage)})`,
      },
      {
        key: "pantriesNeverServedCount",
        label: "Pantries never served",
        explanation: "Available pantries receiving no deliveries.",
        direction: "lower",
        format: (value, result) => `${numeric(value, 0)} (${percent(result.metrics.pantriesNeverServedPercentage)})`,
      },
      { key: "pantryServiceGini", label: "Distribution fairness (Gini)", explanation: "Zero is perfectly even; lower is fairer.", direction: "lower", format: (value) => numeric(value, 3) },
      { key: "pantryServiceGap", label: "Pantry service gap", explanation: "Difference between the most- and least-served pantries.", direction: "lower", format: (value) => numeric(value, 0) },
      { key: "averagePantryPriorityServed", label: "Mean priority served", explanation: "Average priority of the pantries receiving deliveries.", direction: "higher", format: (value) => numeric(value, 3) },
    ],
  },
  {
    title: "Driver and route burden",
    description: "The time and travel asked of volunteers on completed routes.",
    metrics: [
      { key: "averageDriveMinutes", label: "Mean driving time", explanation: "Average driving minutes per completed route.", direction: "lower", format: (value) => `${numeric(value)} min` },
      { key: "averageDistanceMiles", label: "Mean distance", explanation: "Approximate average miles per completed route.", direction: "lower", format: (value) => `${numeric(value, 2)} mi` },
      { key: "averagePredepartureWaitMinutes", label: "Mean planned departure lead", explanation: "Average time between opening the app and the optimizer's recommended departure. This is scheduling information, not a score penalty.", direction: "none", format: (value) => `${numeric(value)} min` },
      { key: "averageRequestedTimeDeviationMinutes", label: "Mean minutes outside request", explanation: "Average minutes a completed route starts before or finishes after the driver's requested interval.", direction: "lower", format: (value) => `${numeric(value)} min` },
      { key: "averageOutsideRequestedWindowRatio", label: "Mean outside-window share", explanation: "Outside-request minutes divided by the requested interval length. This normalized value is the time-fit penalty used in scoring.", direction: "lower", format: (value) => percent(value, 1) },
      { key: "preferredWindowFitRate", label: "Preferred-window fit", explanation: "Share of completed routes contained entirely within the driver's preferred trip interval.", direction: "higher", format: (value) => percent(value, 1) },
      { key: "averageTotalTripDurationMinutes", label: "Mean total trip duration", explanation: "Driving, waiting, pickup, and drop-off time combined.", direction: "lower", format: (value) => `${numeric(value)} min` },
    ],
  },
  {
    title: "Acceptance and rejection",
    description: "Selections are deterministic in this academic replay; behavioral measures remain model-based diagnostics.",
    metrics: [
      { key: "driverAcceptanceRate", label: "Driver acceptance (simulated)", explanation: "Share selecting rank #1 in this replay.", direction: "higher", format: (value) => percent(value) },
      { key: "expectedDriverAcceptanceRate", label: "Expected acceptance", explanation: "Behavioral estimate based on driving burden, normalized requested-time fit, and destination fit.", direction: "higher", format: (value) => percent(value, 1) },
      {
        key: "offersLikelyRejected",
        label: "Likely rejected offers",
        explanation: "Count and percentage predicted unlikely to be accepted.",
        direction: "lower",
        format: (value, result) => `${numeric(value, 0)} (${percent(result.metrics.likelyRejectionRate, 1)})`,
      },
    ],
  },
  {
    title: "Optimization performance",
    description: "The stated objective value and computational performance of each policy.",
    metrics: [
      { key: "systemObjectiveValue", label: "System objective value", explanation: "Higher is better for the declared BakedBoston objective.", direction: "higher", format: (value) => numeric(value, 2) },
      { key: "totalSolverRuntimeSeconds", label: "Total solve time", explanation: "Time across all decision epochs.", direction: "lower", format: (value) => `${numeric(value, 4)} s` },
      { key: "averageSolverRuntimeSeconds", label: "Mean solve time", explanation: "Average computation time per nonempty decision epoch.", direction: "lower", format: (value) => `${numeric(value, 6)} s` },
      {
        key: "averageOptimalityGap",
        label: "Gurobi optimality gap",
        explanation: "Zero means a proven optimum. Baseline heuristics do not have a MIP gap.",
        direction: "lower",
        format: (value, result) => result.policy === "bakedboston_mip" && value === null ? "Optimal" : value === null ? "n/a" : percent(value, 2),
      },
    ],
  },
];

const interestingEpoch = (day: SimulationDay) => {
  const fullyCoveredSimultaneous = day.decisionEpochs.findIndex(
    (epoch) =>
      epoch.queueSize > 1 &&
      epoch.driverRecommendations.length > 1 &&
      epoch.driverRecommendations.every((driver) => driver.routes.length > 0),
  );
  if (fullyCoveredSimultaneous >= 0) return fullyCoveredSimultaneous;
  const simultaneous = day.decisionEpochs.findIndex((epoch) => epoch.queueSize > 1 && epoch.candidateCount > 0);
  if (simultaneous >= 0) return simultaneous;
  const feasible = day.decisionEpochs.findIndex((epoch) => epoch.candidateCount > 0);
  return Math.max(feasible, 0);
};

const interestingReplay = (result: PolicyResult) => {
  for (let dayIndex = 0; dayIndex < result.days.length; dayIndex += 1) {
    const day = result.days[dayIndex];
    const epochIndex = day.decisionEpochs.findIndex(
      (epoch) =>
        epoch.queueSize > 1 &&
        epoch.driverRecommendations.length > 1 &&
        epoch.driverRecommendations.every((driver) => driver.routes.length > 0),
    );
    if (epochIndex >= 0) return { dayIndex, epochIndex };
  }
  return { dayIndex: 0, epochIndex: interestingEpoch(result.days[0]) };
};

export function SimulatorClient({ data }: Props) {
  const savedPayload = data as SimulationPayload;
  const [payload, setPayload] = useState(savedPayload);
  const [viewMode, setViewMode] = useState<"saved" | "custom">("saved");
  const [resultMode, setResultMode] = useState<"saved" | "custom">("saved");
  const [customConfig, setCustomConfig] = useState<CustomConfig>({
    driversPerDay: 6,
    bakeryCount: 9,
    pantryCount: 9,
    horizonDays: 5,
    randomSeed: 2042,
    maxSimultaneousDrivers: 3 as 2 | 3,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const mip = payload.results.find((result) => result.policy === "bakedboston_mip") ?? payload.results[0];
  const initialReplay = interestingReplay(mip);
  const [dayIndex, setDayIndex] = useState(initialReplay.dayIndex);
  const [epochIndex, setEpochIndex] = useState(initialReplay.epochIndex);
  const [driverIndex, setDriverIndex] = useState(0);
  const [mapMode, setMapMode] = useState<"driver" | "window">("driver");
  const [mapTooltip, setMapTooltip] = useState<MapTooltip | null>(null);

  const day = mip.days[dayIndex] ?? mip.days[0];
  const epoch = day.decisionEpochs[epochIndex] ?? day.decisionEpochs[0];
  const recommendations = epoch.driverRecommendations;
  const activeDriver = recommendations[driverIndex] ?? recommendations[0];
  const activeRequest = epoch.requests.find((request) => request.requestId === activeDriver?.requestId);
  const selectedRoute = activeDriver?.routes.find((route) => route.selected) ?? activeDriver?.selectedRoute ?? null;

  const mapRoutes = useMemo(() => {
    if (mapMode === "driver") return activeDriver?.routes ?? [];
    return recommendations
      .map((driver) => driver.routes.find((route) => route.selected) ?? driver.selectedRoute)
      .filter((route): route is RouteOption => Boolean(route));
  }, [activeDriver, mapMode, recommendations]);

  const actualDriverRequests = useMemo(
    () => mip.days.reduce((total, item) => total + item.driverRequests, 0),
    [mip.days],
  );

  const pickupWindowsByBakery = useMemo(() => {
    const windows = new Map<string, PickupWindow[]>();
    for (const item of day.pickupWindows ?? []) {
      windows.set(item.bakeryName, [...(windows.get(item.bakeryName) ?? []), item]);
    }
    return windows;
  }, [day.pickupWindows]);

  const pantryWindowsByPantry = useMemo(() => {
    const windows = new Map<string, PantryWindow[]>();
    for (const item of day.pantryWindows ?? []) {
      windows.set(item.pantryName, [...(windows.get(item.pantryName) ?? []), item]);
    }
    return windows;
  }, [day.pantryWindows]);

  const bakeryHoverLabel = (bakeryName: string, pickupId?: string, postalCode?: string) => {
    const available = pickupWindowsByBakery.get(bakeryName) ?? [];
    const exact = pickupId ? available.filter((item) => item.pickupId === pickupId) : available;
    const windows = exact.length ? exact : available;
    const heading = `${bakeryName} · bakery${postalCode ? ` · ZIP ${postalCode}` : ""}`;
    if (!windows.length) return `${heading}\nNo food-ready pickup window on ${formatDate(day.serviceDate)}`;
    return `${heading}\n${windows
      .map((item) => `Pickup: ${formatClock(item.readyAt)}–${formatClock(item.pickupDeadline)}`)
      .join("\n")}`;
  };

  const pantryHoverLabel = (pantryName: string, pantryWindowId?: string, postalCode?: string) => {
    const available = pantryWindowsByPantry.get(pantryName) ?? [];
    const exact = pantryWindowId ? available.filter((item) => item.pantryWindowId === pantryWindowId) : available;
    const windows = exact.length ? exact : available;
    const heading = `${pantryName} · pantry${postalCode ? ` · ZIP ${postalCode}` : ""}`;
    if (!windows.length) return `${heading}\nNo receiving window on ${formatDate(day.serviceDate)}`;
    return `${heading}\n${windows
      .map(
        (item) =>
          `Receiving: ${formatClock(item.receivingStart)}–${formatClock(item.receivingEnd)} · latest arrival ${formatClock(item.latestPermittedArrival)}`,
      )
      .join("\n")}`;
  };

  const mapProjection = useMemo(() => {
    const coordinates = [
      ...payload.network.bakeries,
      ...payload.network.pantries,
      ...mapRoutes.flatMap((route) => [route.driverStart, route.bakeryLocation, route.pantryLocation]),
      ...(activeRequest?.startLocation ? [activeRequest.startLocation] : []),
      ...(activeRequest?.preferredDestination ? [activeRequest.preferredDestination] : []),
    ];
    const latitudes = coordinates.map((point) => point.latitude);
    const longitudes = coordinates.map((point) => point.longitude);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);
    const latitudeRange = Math.max(maxLatitude - minLatitude, 0.01);
    const longitudeRange = Math.max(maxLongitude - minLongitude, 0.01);
    return (point: Coordinate) => ({
      x: 55 + ((point.longitude - minLongitude) / longitudeRange) * 890,
      y: 465 - ((point.latitude - minLatitude) / latitudeRange) * 410,
    });
  }, [activeRequest, mapRoutes, payload.network]);

  const requestRadiusPixels = (center: Coordinate, radiusMiles: number) => {
    const longitudeMilesPerDegree = Math.max(69 * Math.cos((center.latitude * Math.PI) / 180), 1);
    const edge = mapProjection({
      latitude: center.latitude,
      longitude: center.longitude + radiusMiles / longitudeMilesPerDegree,
    });
    const centerPoint = mapProjection(center);
    return Math.max(18, Math.min(170, Math.abs(edge.x - centerPoint.x)));
  };

  const metricWinner = (metric: MetricDefinition, result: PolicyResult) => {
    if (metric.direction === "none") return false;
    const values = payload.results
      .map((policy) => policy.metrics[metric.key])
      .filter((value): value is number => typeof value === "number");
    const current = result.metrics[metric.key];
    if (typeof current !== "number" || !values.length) return false;
    const best = metric.direction === "higher" ? Math.max(...values) : Math.min(...values);
    return Math.abs(current - best) < 1e-9;
  };

  const chooseDay = (nextDay: number) => {
    const nextEpoch = interestingEpoch(mip.days[nextDay]);
    const firstWithRoutes = mip.days[nextDay].decisionEpochs[nextEpoch].driverRecommendations.findIndex(
      (driver) => driver.routes.length > 0,
    );
    setDayIndex(nextDay);
    setEpochIndex(nextEpoch);
    setDriverIndex(Math.max(firstWithRoutes, 0));
    setMapMode("driver");
    setMapTooltip(null);
  };

  const resetReplay = (nextPayload: SimulationPayload) => {
    const nextMip = nextPayload.results.find((result) => result.policy === "bakedboston_mip") ?? nextPayload.results[0];
    const nextReplay = interestingReplay(nextMip);
    const firstWithRoutes = nextMip.days[nextReplay.dayIndex].decisionEpochs[nextReplay.epochIndex].driverRecommendations.findIndex(
      (driver) => driver.routes.length > 0,
    );
    setDayIndex(nextReplay.dayIndex);
    setEpochIndex(nextReplay.epochIndex);
    setDriverIndex(Math.max(firstWithRoutes, 0));
    setMapMode("driver");
    setMapTooltip(null);
  };

  const showSavedExample = () => {
    setViewMode("saved");
    setResultMode("saved");
    setPayload(savedPayload);
    setRunError("");
    resetReplay(savedPayload);
  };

  const updateCustomConfig = (key: keyof CustomConfig, value: number) => {
    setCustomConfig((current) => ({
      ...current,
      [key]: key === "maxSimultaneousDrivers" ? (value as 2 | 3) : value,
    }));
  };

  const runCustomSimulation = async () => {
    setIsRunning(true);
    setRunError("");
    try {
      const response = await fetch("/api/simulator/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customConfig),
      });
      const result = await response.json() as SimulationPayload & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The custom simulation could not be completed.");
      setPayload(result);
      setViewMode("custom");
      setResultMode("custom");
      resetReplay(result);
      document.querySelector("#replay")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "The custom simulation could not be completed.");
    } finally {
      setIsRunning(false);
    }
  };

  const chooseEpoch = (nextEpoch: number) => {
    setEpochIndex(nextEpoch);
    const firstWithRoutes = day.decisionEpochs[nextEpoch].driverRecommendations.findIndex(
      (driver) => driver.routes.length > 0,
    );
    setDriverIndex(Math.max(firstWithRoutes, 0));
    setMapMode("driver");
    setMapTooltip(null);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="BakedBoston home">
          <span className={styles.logo}>B</span>
          <span>BakedBoston</span>
        </Link>
        <nav className={styles.nav} aria-label="Simulator navigation">
          <a href="#replay">Replay</a>
          <a href="#comparison">Compare policies</a>
          <a href="https://github.com/vapeyproductions/bakedboston-optimizer" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </nav>
      </header>

      <section className={styles.modeBar} aria-label="Simulation type">
        <div className={styles.modeCopy}>
          <p className={styles.eyebrow}>CHOOSE AN EXPERIMENT</p>
          <h2>{viewMode === "saved" ? "Start with a complete saved example" : "Build a custom scarcity scenario"}</h2>
          <p>
            {viewMode === "saved"
              ? "This reproducible five-day study is ready to explore immediately."
              : "Choose the network size and driver supply. Every policy receives the exact same seeded scenario."}
          </p>
        </div>
        <div className={styles.modeTabs} role="group" aria-label="Experiment mode">
          <button className={viewMode === "saved" ? styles.activeMode : ""} onClick={showSavedExample} type="button">
            Saved example
          </button>
          <button className={viewMode === "custom" ? styles.activeMode : ""} onClick={() => setViewMode("custom")} type="button">
            Custom simulation
          </button>
        </div>

        {viewMode === "custom" ? (
          <div className={styles.customPanel}>
            <div className={styles.controlGrid}>
              <label className={styles.controlField}>
                <span>Daily driver cap</span>
                <strong>{customConfig.driversPerDay}</strong>
                <input aria-label="Daily driver cap" max="12" min="1" onChange={(event) => updateCustomConfig("driversPerDay", Number(event.target.value))} type="range" value={customConfig.driversPerDay} />
                <small>Each day randomly uses 1–{customConfig.driversPerDay} volunteers.</small>
              </label>
              <label className={styles.controlField}>
                <span>Bakeries</span>
                <strong>{customConfig.bakeryCount}</strong>
                <input aria-label="Number of bakeries" max="9" min="2" onChange={(event) => updateCustomConfig("bakeryCount", Number(event.target.value))} type="range" value={customConfig.bakeryCount} />
                <small>2–9 pickup sites</small>
              </label>
              <label className={styles.controlField}>
                <span>Pantries</span>
                <strong>{customConfig.pantryCount}</strong>
                <input aria-label="Number of pantries" max="9" min="2" onChange={(event) => updateCustomConfig("pantryCount", Number(event.target.value))} type="range" value={customConfig.pantryCount} />
                <small>2–9 receiving sites</small>
              </label>
              <div className={styles.controlField}>
                <span>Simulation days</span>
                <strong>5</strong>
                <small>Every saved and custom comparison uses a five-day horizon.</small>
              </div>
              <label className={styles.controlField}>
                <span>Maximum drivers in one window</span>
                <select aria-label="Maximum simultaneous drivers" onChange={(event) => updateCustomConfig("maxSimultaneousDrivers", Number(event.target.value))} value={customConfig.maxSimultaneousDrivers}>
                  <option value="2">2 drivers</option>
                  <option value="3">3 drivers</option>
                </select>
                <small>Most decision times have one driver. Only one or two times per day may include up to {customConfig.maxSimultaneousDrivers} simultaneous drivers.</small>
              </label>
              <label className={styles.controlField}>
                <span>Reproducible seed</span>
                <input aria-label="Random seed" max="999999999" min="1" onChange={(event) => updateCustomConfig("randomSeed", Number(event.target.value))} type="number" value={customConfig.randomSeed} />
                <small>Reuse a seed to reproduce the same events.</small>
              </label>
            </div>
            <div className={styles.customActions}>
              <div className={styles.scenarioSummary}>
                <strong>Up to {customConfig.driversPerDay} drivers/day for {customConfig.bakeryCount} bakeries</strong>
                <span>
                  {customConfig.driversPerDay < customConfig.bakeryCount
                    ? "Driver scarcity is built into this run, so some eligible pickups may remain unserved."
                    : "Driver supply meets or exceeds the bakery count; lower it to stress-test scarcity."}
                </span>
              </div>
              <button className={styles.runButton} disabled={isRunning} onClick={runCustomSimulation} type="button">
                {isRunning ? "Gurobi is solving…" : "Run Gurobi simulation"}
              </button>
            </div>
            <p className={styles.runStatus}>
              {resultMode === "custom"
                ? "The custom Gurobi result is loaded below. Change any setting and run again to create a new experiment."
                : "The saved example remains visible below until you run this custom experiment."}
            </p>
            {runError ? <p className={styles.runError} role="alert">{runError}</p> : null}
          </div>
        ) : null}
      </section>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ACADEMIC ROUTING LAB</p>
          <h1 className={styles.heroTitle}>See every recommendation. Then see what the driver selected.</h1>
          <p className={styles.lede}>
            Replay {payload.scenario.horizonDays} synthetic service days. At every decision time, BakedBoston generates feasible routes,
            solves simultaneous driver conflicts with Gurobi, builds fair conflict-free menus, and selects the
            highest-scoring recommendation shown to each driver.
          </p>
        </div>
        <aside className={styles.heroCard}>
          <span>{resultMode === "saved" ? "SAVED EXAMPLE" : "CUSTOM RUN"}</span>
          <strong>{payload.scenario.horizonDays} days</strong>
          <p>Up to {payload.scenario.driversPerDay} synthetic drivers per day</p>
          <p>{payload.scenario.bakeryCount ?? payload.network.bakeries.length} bakeries · {payload.scenario.pantryCount ?? payload.network.pantries.length} pantries</p>
          <p>Mostly solo arrivals · rare overlaps up to {payload.scenario.maxSimultaneousDrivers} drivers</p>
          <p>{actualDriverRequests} drivers actually entered this run</p>
          <p>Seed {payload.scenario.seed} · reproducible</p>
        </aside>
      </section>

      <section className={styles.replay} id="replay">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>INTERACTIVE REPLAY</p>
            <h2>Walk through the rolling-horizon solve</h2>
          </div>
          <span className={styles.solverPill}>Gurobi {payload.runtime.gurobiVersion} · {epoch.solver.status}</span>
        </div>

        <div className={styles.dayTabs} aria-label="Simulation day">
          {mip.days.map((item, index) => (
            <button
              className={index === dayIndex ? styles.activeTab : ""}
              key={item.serviceDate}
              onClick={() => chooseDay(index)}
              type="button"
            >
              <span>Day {index + 1}</span>
              <small>{formatDate(item.serviceDate)}</small>
            </button>
          ))}
        </div>

        <div className={styles.simulatorGrid}>
          <aside className={styles.timelinePanel}>
            <p className={styles.panelLabel}>DECISION TIMES</p>
            {day.decisionEpochs.map((item, index) => (
              <button
                className={index === epochIndex ? styles.activeEpoch : ""}
                key={item.decisionEpoch}
                onClick={() => chooseEpoch(index)}
                type="button"
              >
                <span>{formatClock(item.decisionEpoch)}</span>
                <small>{item.queueSize} driver{item.queueSize === 1 ? "" : "s"} · {item.candidateCount} routes</small>
              </button>
            ))}
            <div className={styles.daySummary}>
              <div><strong>{day.foodAvailablePickups}</strong><span>food-ready pickups</span></div>
              <div><strong>{day.openPantryWindows}</strong><span>open pantry windows</span></div>
              <div><strong>{day.feasibleCandidatesEvaluated}</strong><span>routes evaluated</span></div>
            </div>
          </aside>

          <div className={styles.tracePanel}>
            <div className={styles.epochHeader}>
              <div>
                <p className={styles.panelLabel}>SOLVE AT {formatClock(epoch.decisionEpoch).toUpperCase()}</p>
                <h3>{epoch.queueSize > 1 ? `${epoch.queueSize} drivers enter together` : "One driver enters the queue"}</h3>
                <p>
                  {epoch.queueSize > 1
                    ? "The model considers every feasible route jointly. Each bakery pickup can appear in only one driver's menu, and every feasible driver gets one option before anyone gets a second."
                    : "The model filters for timing feasibility, scores every remaining route, and ranks the options."}
                </p>
              </div>
              <div className={styles.solveStats}>
                <div><strong>{epoch.candidateCount}</strong><span>candidates</span></div>
                <div><strong>{epoch.selectedCount}</strong><span>matches</span></div>
                <div><strong>{numeric(epoch.solver.runtimeSeconds * 1000, 1)} ms</strong><span>solve time</span></div>
              </div>
            </div>

            <div className={styles.driverTabs} aria-label="Driver recommendations">
              {recommendations.map((driver, index) => (
                <button
                  className={index === driverIndex ? styles.activeDriver : ""}
                  key={driver.requestId}
                  onClick={() => setDriverIndex(index)}
                  type="button"
                >
                  {compactDriver(driver.driverId)}
                  <small>{driver.routes.length ? `${driver.routes.length} shown` : "no feasible route"}</small>
                </button>
              ))}
            </div>

            {activeRequest ? (
              <section className={styles.requestSummary} aria-label="Selected driver request">
                <div className={styles.requestSummaryHeader}>
                  <div>
                    <p className={styles.panelLabel}>DRIVER REQUEST</p>
                    <h3>{compactDriver(activeRequest.driverId)} entered at {formatClock(activeRequest.loggedAt)}</h3>
                  </div>
                  <span>Soft preferences</span>
                </div>
                <div className={styles.requestSummaryGrid}>
                  <div>
                    <small>REQUESTED ROUTE INTERVAL</small>
                    <strong>{formatClock(activeRequest.preferredStart)}–{formatClock(activeRequest.preferredFinish)}</strong>
                    <span>{numeric(activeRequest.requestedWindowMinutes ?? 30, 0)} minutes signaled</span>
                  </div>
                  <div>
                    <small>REQUESTED ORIGIN</small>
                    <strong>
                      ZIP {activeRequest.startZipCode ?? activeRequest.startLocation?.postalCode ?? "area"}
                      {` · within ${numeric(activeRequest.startRadiusMiles ?? 2, 0)} miles`}
                    </strong>
                    <span>Bakery distance beyond the orange area is normalized across feasible routes</span>
                  </div>
                  <div>
                    <small>PREFERRED DESTINATION</small>
                    <strong>
                      {activeRequest.preferredDestination
                        ? `ZIP ${activeRequest.destinationZipCode ?? activeRequest.preferredDestination.postalCode ?? "area"} · within ${numeric(activeRequest.destinationRadiusMiles ?? 2, 0)} miles`
                        : "No destination preference"}
                    </strong>
                    <span>{activeRequest.preferredDestination ? "Pantry distance beyond the green area is normalized across feasible routes" : "Destination fit is not scored"}</span>
                  </div>
                </div>
                <p>
                  These preferences guide ranking rather than feasibility. BakedBoston may still recommend a route
                  outside the interval or radii when it is the strongest available option.
                </p>
              </section>
            ) : null}

            <section className={styles.mapPanel} aria-label="Interactive recommendation map">
              <div className={styles.mapHeader}>
                <div>
                  <p className={styles.panelLabel}>ROUTE MAP</p>
                  <h3>{mapMode === "driver" ? "All routes shown to this driver" : "All selections in this decision window"}</h3>
                  <p>
                    {mapMode === "driver"
                      ? "Dashed lines are alternatives. The solid orange line is the highest-scoring route selected by the driver."
                      : "Each line is the rank-1 route selected by a driver solved in this shared decision window."}
                  </p>
                </div>
                <div className={styles.mapMode} role="group" aria-label="Map view">
                  <button className={mapMode === "driver" ? styles.activeMapMode : ""} onClick={() => setMapMode("driver")} type="button">
                    Selected driver
                  </button>
                  <button className={mapMode === "window" ? styles.activeMapMode : ""} onClick={() => setMapMode("window")} type="button">
                    Decision window
                  </button>
                </div>
              </div>

              <div className={styles.routeMap}>
                <svg viewBox="0 0 1000 520" role="img" aria-label="Boston-area route recommendations">
                  <defs>
                    <pattern id="simulatorGrid" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
                      <rect width="64" height="64" fill="#e8ecdf" />
                      <rect width="8" height="64" fill="#f8f5eb" />
                    </pattern>
                  </defs>
                  <rect width="1000" height="520" fill="url(#simulatorGrid)" />
                  <path d="M0 392 C190 330 270 435 455 365 S750 270 1000 320 V520 H0 Z" fill="#d4e8e3" opacity=".78" />
                  {activeRequest?.startLocation ? (() => {
                    const point = mapProjection(activeRequest.startLocation);
                    const radius = requestRadiusPixels(activeRequest.startLocation, activeRequest.startRadiusMiles ?? 2);
                    return (
                      <g className={styles.requestMapLayer}>
                        <circle className={`${styles.requestRadius} ${styles.requestOriginRadius}`} cx={point.x} cy={point.y} r={radius} />
                        <circle className={`${styles.requestCenter} ${styles.requestOriginCenter}`} cx={point.x} cy={point.y} r="7" />
                        <text className={styles.requestMapLabel} x={point.x + 12} y={point.y - radius - 8}>
                          ZIP {activeRequest.startZipCode ?? activeRequest.startLocation.postalCode ?? "area"} · requested origin · {numeric(activeRequest.startRadiusMiles ?? 2, 0)} mi
                        </text>
                      </g>
                    );
                  })() : null}
                  {activeRequest?.preferredDestination ? (() => {
                    const point = mapProjection(activeRequest.preferredDestination);
                    const radius = requestRadiusPixels(
                      activeRequest.preferredDestination,
                      activeRequest.destinationRadiusMiles ?? 2,
                    );
                    return (
                      <g className={styles.requestMapLayer}>
                        <circle className={`${styles.requestRadius} ${styles.requestDestinationRadius}`} cx={point.x} cy={point.y} r={radius} />
                        <circle className={`${styles.requestCenter} ${styles.requestDestinationCenter}`} cx={point.x} cy={point.y} r="7" />
                        <text className={styles.requestMapLabel} x={point.x + 12} y={point.y + radius + 18}>
                          ZIP {activeRequest.destinationZipCode ?? activeRequest.preferredDestination.postalCode ?? "area"} · preferred destination · {numeric(activeRequest.destinationRadiusMiles ?? 2, 0)} mi
                        </text>
                      </g>
                    );
                  })() : null}
                  {payload.network.bakeries.map((node) => {
                    const point = mapProjection(node);
                    const label = bakeryHoverLabel(node.name, undefined, node.postalCode);
                    return (
                      <g
                        aria-label={label.replaceAll("\n", ". ")}
                        className={styles.mapInteractiveNode}
                        key={node.id}
                        onClick={() => setMapTooltip({ ...point, label })}
                        onFocus={() => setMapTooltip({ ...point, label })}
                        onMouseEnter={() => setMapTooltip({ ...point, label })}
                        onMouseLeave={() => setMapTooltip(null)}
                        onBlur={() => setMapTooltip(null)}
                        role="button"
                        tabIndex={0}
                      >
                        {node.postalCode ? <>
                          <circle className={`${styles.facilityZipArea} ${styles.facilityBakeryZipArea}`} cx={point.x} cy={point.y} r="31" />
                          <text className={styles.facilityZipLabel} textAnchor="middle" x={point.x} y={point.y + 43}>
                            ZIP {node.postalCode}
                          </text>
                        </> : null}
                        <circle className={styles.mapHitArea} cx={point.x} cy={point.y} r="18" />
                        <circle className={styles.networkBakery} cx={point.x} cy={point.y} r="6" />
                      </g>
                    );
                  })}
                  {payload.network.pantries.map((node) => {
                    const point = mapProjection(node);
                    const label = pantryHoverLabel(node.name, undefined, node.postalCode);
                    return (
                      <g
                        aria-label={label.replaceAll("\n", ". ")}
                        className={styles.mapInteractiveNode}
                        key={node.id}
                        onClick={() => setMapTooltip({ ...point, label })}
                        onFocus={() => setMapTooltip({ ...point, label })}
                        onMouseEnter={() => setMapTooltip({ ...point, label })}
                        onMouseLeave={() => setMapTooltip(null)}
                        onBlur={() => setMapTooltip(null)}
                        role="button"
                        tabIndex={0}
                      >
                        {node.postalCode ? <>
                          <circle className={`${styles.facilityZipArea} ${styles.facilityPantryZipArea}`} cx={point.x} cy={point.y} r="31" />
                          <text className={styles.facilityZipLabel} textAnchor="middle" x={point.x} y={point.y + 43}>
                            ZIP {node.postalCode}
                          </text>
                        </> : null}
                        <circle className={styles.mapHitArea} cx={point.x} cy={point.y} r="18" />
                        <rect className={styles.networkPantry} height="10" rx="2" width="10" x={point.x - 5} y={point.y - 5} />
                      </g>
                    );
                  })}
                  {mapMode === "driver" && activeRequest ? mapRoutes.map((route, index) => {
                    const bakery = mapProjection(route.bakeryLocation);
                    const pantry = mapProjection(route.pantryLocation);
                    const colors = ["#f56447", "#286b59", "#b87d08", "#654b9b", "#167b88"];
                    const color = route.selected ? "#f56447" : colors[index % colors.length];
                    const originCenter = activeRequest.startLocation
                      ? mapProjection(activeRequest.startLocation)
                      : null;
                    const destinationCenter = activeRequest.preferredDestination
                      ? mapProjection(activeRequest.preferredDestination)
                      : null;
                    const originBoundary = originCenter
                      ? pointAtRadiusBoundary(
                        originCenter,
                        bakery,
                        requestRadiusPixels(activeRequest.startLocation!, activeRequest.startRadiusMiles ?? 2),
                      )
                      : null;
                    const destinationBoundary = destinationCenter
                      ? pointAtRadiusBoundary(
                        destinationCenter,
                        pantry,
                        requestRadiusPixels(activeRequest.preferredDestination!, activeRequest.destinationRadiusMiles ?? 2),
                      )
                      : null;

                    return (
                      <g key={`spatial-${route.requestId}-${route.pickupId}-${route.pantryWindowId}`}>
                        {originBoundary && route.originDeviationMiles > 0.01 ? (
                          <line
                            className={styles.spatialDeviationLine}
                            stroke={color}
                            x1={bakery.x}
                            x2={originBoundary.x}
                            y1={bakery.y}
                            y2={originBoundary.y}
                          >
                            <title>
                              Start ZIP deviation: {numeric(route.originDeviationMiles, 2)} miles outside the requested area
                            </title>
                          </line>
                        ) : null}
                        {destinationBoundary && route.destinationDeviationMiles > 0.01 ? (
                          <line
                            className={styles.spatialDeviationLine}
                            stroke={color}
                            x1={pantry.x}
                            x2={destinationBoundary.x}
                            y1={pantry.y}
                            y2={destinationBoundary.y}
                          >
                            <title>
                              Destination ZIP deviation: {numeric(route.destinationDeviationMiles, 2)} miles outside the requested area
                            </title>
                          </line>
                        ) : null}
                      </g>
                    );
                  }) : null}
                  {mapRoutes.map((route, index) => {
                    const driver = mapProjection(route.driverStart);
                    const bakery = mapProjection(route.bakeryLocation);
                    const pantry = mapProjection(route.pantryLocation);
                    const selected = mapMode === "window" || route.selected;
                    const colors = ["#f56447", "#286b59", "#b87d08", "#654b9b", "#167b88"];
                    const color = selected && mapMode === "driver" ? "#f56447" : colors[index % colors.length];
                    const labelX = (bakery.x + pantry.x) / 2;
                    const labelY = (bakery.y + pantry.y) / 2;
                    return (
                      <g key={`${route.requestId}-${route.pickupId}-${route.pantryWindowId}`}>
                        <polyline
                          className={selected && mapMode === "driver" ? styles.chosenMapRoute : styles.alternativeMapRoute}
                          fill="none"
                          points={`${driver.x},${driver.y} ${bakery.x},${bakery.y} ${pantry.x},${pantry.y}`}
                          stroke={color}
                        >
                          <title>{compactDriver(route.driverId)}: {route.bakeryName} to {route.pantryName}, score {score(route.routeScore)}</title>
                        </polyline>
                        <circle cx={labelX} cy={labelY} fill="#fffdf8" r="15" stroke={color} strokeWidth="3" />
                        <text className={styles.mapRankLabel} dominantBaseline="central" textAnchor="middle" x={labelX} y={labelY}>
                          {mapMode === "driver" ? route.recommendationRank : index + 1}
                        </text>
                      </g>
                    );
                  })}
                  {mapRoutes.map((route) => {
                    const driver = mapProjection(route.driverStart);
                    const bakery = mapProjection(route.bakeryLocation);
                    const pantry = mapProjection(route.pantryLocation);
                    const bakeryLabel = bakeryHoverLabel(
                      route.bakeryName,
                      route.pickupId,
                      route.bakeryPostalCode ?? route.bakeryLocation.postalCode,
                    );
                    const pantryLabel = pantryHoverLabel(
                      route.pantryName,
                      route.pantryWindowId,
                      route.pantryPostalCode ?? route.pantryLocation.postalCode,
                    );
                    return (
                      <g key={`nodes-${route.requestId}-${route.pickupId}-${route.pantryWindowId}`}>
                        <g transform={`translate(${driver.x} ${driver.y})`}><circle className={styles.driverNode} r="17" /><text className={styles.mapEmoji} textAnchor="middle" y="7">🚗</text><title>{compactDriver(route.driverId)}</title></g>
                        <g
                          aria-label={bakeryLabel.replaceAll("\n", ". ")}
                          className={styles.mapInteractiveNode}
                          onClick={() => setMapTooltip({ ...bakery, label: bakeryLabel })}
                          onFocus={() => setMapTooltip({ ...bakery, label: bakeryLabel })}
                          onMouseEnter={() => setMapTooltip({ ...bakery, label: bakeryLabel })}
                          onMouseLeave={() => setMapTooltip(null)}
                          onBlur={() => setMapTooltip(null)}
                          role="button"
                          tabIndex={0}
                          transform={`translate(${bakery.x} ${bakery.y})`}
                        ><circle className={styles.bakeryNode} r="17" /><text className={styles.mapEmoji} textAnchor="middle" y="7">🥖</text></g>
                        <g
                          aria-label={pantryLabel.replaceAll("\n", ". ")}
                          className={styles.mapInteractiveNode}
                          onClick={() => setMapTooltip({ ...pantry, label: pantryLabel })}
                          onFocus={() => setMapTooltip({ ...pantry, label: pantryLabel })}
                          onMouseEnter={() => setMapTooltip({ ...pantry, label: pantryLabel })}
                          onMouseLeave={() => setMapTooltip(null)}
                          onBlur={() => setMapTooltip(null)}
                          role="button"
                          tabIndex={0}
                          transform={`translate(${pantry.x} ${pantry.y})`}
                        ><circle className={styles.pantryNode} r="17" /><text className={styles.mapEmoji} textAnchor="middle" y="7">🥫</text></g>
                        {route.selected || mapMode === "window" ? <>
                          <text className={styles.mapNodeLabel} textAnchor="middle" x={bakery.x} y={bakery.y - 27}>{route.bakeryName}</text>
                          <text className={styles.mapNodeLabel} textAnchor="middle" x={pantry.x} y={pantry.y - 27}>{route.pantryName}</text>
                        </> : null}
                      </g>
                    );
                  })}
                </svg>
                {mapTooltip ? (
                  <div
                    className={styles.mapTooltip}
                    role="status"
                    style={{
                      left: `${mapTooltip.x / 10}%`,
                      top: `${mapTooltip.y / 5.2}%`,
                      transform: `translate(${mapTooltip.x > 650 ? "calc(-100% - 16px)" : "16px"}, ${mapTooltip.y > 330 ? "calc(-100% - 16px)" : "16px"})`,
                    }}
                  >
                    {mapTooltip.label.split("\n").map((line, index) => (
                      index === 0
                        ? <strong key={line}>{line}</strong>
                        : <span key={`${line}-${index}`}>{line}</span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={styles.mapLegend}>
                {mapRoutes.map((route, index) => (
                  <button
                    className={route.selected ? styles.selectedLegendRoute : ""}
                    key={`legend-${route.requestId}-${route.pickupId}-${route.pantryWindowId}`}
                    onClick={() => mapMode === "window" && setDriverIndex(Math.max(recommendations.findIndex((driver) => driver.requestId === route.requestId), 0))}
                    type="button"
                  >
                    <strong>{mapMode === "driver" ? `#${route.recommendationRank}` : compactDriver(route.driverId)}</strong>
                    <span>{route.bakeryName} → {route.pantryName}</span>
                    <small>{score(route.routeScore)} score{route.selected ? " · selected" : ""}</small>
                  </button>
                ))}
              </div>
            </section>

            {activeDriver?.routes.length ? (
              <div className={styles.recommendationArea}>
                <div className={styles.routeListHeading}>
                  <div>
                    <p className={styles.panelLabel}>ROUTES RECOMMENDED TO {compactDriver(activeDriver.driverId).toUpperCase()}</p>
                    <h3>Ranked from highest to lowest score</h3>
                    <p>These are alternative choices for one delivery. Selecting one does not count the remaining choices as rejected offers.</p>
                  </div>
                  <span>Top {activeDriver.routes.length}</span>
                </div>

                <div className={styles.routeList}>
                  {activeDriver.routes.map((route) => {
                    const requestedWindowMinutes = route.requestedWindowMinutes
                      ?? activeRequest?.requestedWindowMinutes
                      ?? 30;
                    const outsideWindowRatio = route.requestedTimeDeviationRatio
                      ?? route.requestedTimeDeviationMinutes / requestedWindowMinutes;

                    return (
                    <article className={`${styles.routeCard} ${route.selected ? styles.selectedRoute : ""}`} key={`${route.pickupId}-${route.pantryWindowId}`}>
                      <div className={styles.rank}>#{route.recommendationRank}</div>
                      <div className={styles.routeMain}>
                        <div className={styles.routePath}>
                          <span>🚗 {compactDriver(route.driverId)}</span>
                          <i>→</i>
                          <span>🥖 {route.bakeryName}</span>
                          <i>→</i>
                          <span>🥫 {route.pantryName}</span>
                        </div>
                        <div className={styles.departurePlan}>
                          <strong>
                            {route.predepartureWaitMinutes > 0.5
                              ? `Planned departure in ${numeric(route.predepartureWaitMinutes, 0)} min · leave ${formatClock(route.departAt)}`
                              : `Leave now · depart ${formatClock(route.departAt)}`}
                          </strong>
                          <span>
                            Logged in {activeRequest ? formatClock(activeRequest.loggedAt) : "—"}
                            {activeRequest ? ` · requested ${formatClock(activeRequest.preferredStart)}–${formatClock(activeRequest.preferredFinish)}` : ""}
                          </span>
                        </div>
                        <div className={styles.routeDetails}>
                          <span>Pickup {formatClock(route.pickupAt)}</span>
                          <span>Pantry {formatClock(route.pantryArrivalAt)}</span>
                          <span>Finish {formatClock(route.finishAt)}</span>
                          <span>{numeric(route.driveMinutes, 1)} drive min</span>
                          <span>
                            {route.withinPreferredWindow
                              ? "Inside requested interval"
                              : `${numeric(route.requestedTimeDeviationMinutes, 0)} min outside · ${numeric(outsideWindowRatio * 100, 1)}% of ${numeric(requestedWindowMinutes, 0)}-min request`}
                          </span>
                          <span>
                            Start ZIP miss {numeric(route.originDeviationMiles, 2)} mi · {numeric(route.normalizedOriginDeviation * 100, 1)}% normalized
                          </span>
                          {activeRequest?.hasPreferredDestination ? (
                            <span>
                              Destination ZIP miss {numeric(route.destinationDeviationMiles, 2)} mi · {numeric(route.normalizedDestinationDeviation * 100, 1)}% normalized
                            </span>
                          ) : null}
                          <span>
                            Spatial penalty input {numeric(route.normalizedSpatialDeviation * 100, 1)}%
                          </span>
                          <span>Priority {numeric(route.pantryPriority, 2)}</span>
                        </div>
                      </div>
                      <div className={styles.routeScore}>
                        <small>ROUTE SCORE</small>
                        <strong>{score(route.routeScore)}</strong>
                        {route.selected ? <span>SELECTED · HIGHEST</span> : null}
                      </div>
                    </article>
                    );
                  })}
                </div>

                {selectedRoute ? (
                  <div className={styles.selectionSummary}>
                    <span className={styles.check}>✓</span>
                    <div>
                      <p className={styles.panelLabel}>DRIVER SELECTION</p>
                      <h3>{selectedRoute.bakeryName} → {selectedRoute.pantryName}</h3>
                      <p>
                        Rank #1 was selected because its score of {score(selectedRoute.routeScore)}{" "}is the highest among
                        this driver&apos;s conflict-free recommendations. Pantry destinations may repeat across drivers,
                        but bakery pickups cannot. The other recommendations remain unselected alternatives—not four
                        additional trips that the driver rejected.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span>∅</span>
                <h3>No route was recommended to {activeDriver ? compactDriver(activeDriver.driverId) : "this driver"}.</h3>
                <p>
                  This is not the model choosing to give another driver extra routes instead. At this decision time,
                  this driver had no institution-window-feasible route or there were fewer distinct feasible bakery pickups than
                  simultaneous drivers{activeRequest ? ` before the wider search ended at ${formatClock(activeRequest.searchUntil)}` : ""}.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.method}>
        <div>
          <p className={styles.eyebrow}>THE EXACT OPTIMIZATION OBJECTIVE</p>
          <h2>Coverage comes first. Route quality decides among maximum-coverage solutions.</h2>
        </div>
        <div className={styles.objectiveExplainer}>
          <div className={styles.objectiveFormulaCard}>
            <div className={styles.objectiveStage}>
              <small>Objective 1 · strict priority</small>
              <strong>maximize Σ yᵣ</strong>
              <p>Select as many feasible bakery pickup occurrences as the available drivers can complete.</p>
            </div>
            <div className={styles.objectiveStage}>
              <small>Objective 2 · among maximum-coverage solutions</small>
              <strong>maximize Σ qᵣ yᵣ</strong>
              <p>Choose the maximum-coverage assignment with the greatest total route quality.</p>
            </div>
            <div className={styles.formula}>
              <span>qᵣ =</span>
              <strong>{payload.objectiveWeights.pantry_priority_reward}Pᵣ</strong>
              <i>−</i>
              <strong>{payload.objectiveWeights.drive_minute_penalty}Dᵣ</strong>
              <i>−</i>
              <strong>{payload.objectiveWeights.requested_time_deviation_ratio_penalty}Oᵣ</strong>
              <i>−</i>
              <strong>{payload.objectiveWeights.spatial_deviation_ratio_penalty}Sᵣ</strong>
            </div>
          </div>
          <div className={styles.objectiveTerms}>
            <h3>What every symbol contributes</h3>
            <dl>
              <div><dt>yᵣ</dt><dd>A binary decision: 1 when complete timed route r is selected; otherwise 0.</dd></div>
              <div><dt>Pᵣ · pantry priority</dt><dd><b>Rewarded.</b> Priority is 1 − (recent services + 1) ÷ (recent receiving opportunities + 2). A pantry that was open but served less often receives a larger value; recent service lowers it.</dd></div>
              <div><dt>Dᵣ · drive minutes</dt><dd><b>Penalized.</b> Total driving from the driver&apos;s origin to the bakery and then from the bakery to the pantry. Five-minute loading and unloading service times are scheduled, but are not counted as driving.</dd></div>
              <div><dt>Oᵣ · outside-window ratio</dt><dd><b>Penalized.</b> Minutes that departure occurs before the requested start plus minutes that completion occurs after the requested finish, divided by the requested interval length. Time inside the interval adds no penalty.</dd></div>
              <div><dt>Sᵣ · spatial deviation ratio</dt><dd><b>Penalized.</b> Start- and destination-area misses are measured from each facility to the nearest edge of the requested ZIP radius, normalized against that driver&apos;s feasible alternatives, then averaged across the supplied location preferences.</dd></div>
            </dl>
          </div>
        </div>
        <p className={styles.formulaNote}>
          The coefficients are policy weights, not probabilities. Login time is the decision epoch—not a forced
          departure—and planned lead time at the origin receives no objective penalty. The scheduler chooses a
          just-in-time departure while confirmed bakery and pantry windows, pickup deadlines, latest permitted pantry
          arrival, one route per driver, and one assignment per bakery pickup remain hard constraints. Requested time
          and ZIP areas are soft preferences. A negative qᵣ therefore means “lower quality than another feasible route,”
          not “infeasible.”
        </p>
      </section>

      <section className={styles.comparisonSection} id="comparison">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>POLICY COMPARISON</p>
            <h2>One scenario, six routing policies</h2>
          </div>
          <p>Every policy receives the same {payload.scenario.horizonDays}-day surplus, pantry, and driver events.</p>
        </div>

        <div className={styles.tradeoffCallout}>
          <div>
            <span className={styles.calloutIcon}>↔</span>
            <div>
              <h3>The MIP is not supposed to win every column.</h3>
              <p>
                Highest Pantry Priority can distribute service more evenly, while Shortest Route or Earliest Deadline
                can minimize a particular travel measure. BakedBoston&apos;s Gurobi model is optimal for its declared
                two-level objective: first maximize completed assignments, then maximize total weighted route quality
                across the drivers entering together.
              </p>
            </div>
          </div>
          <div className={styles.objectiveEvidence}>
            <span>MIP objective</span>
            <strong>{numeric(mip.metrics.systemObjectiveValue, 2)}</strong>
            <small>Best system objective in this run</small>
          </div>
        </div>

        <div className={styles.policyCards}>
          {payload.results.map((result) => (
            <article className={result.policy === "bakedboston_mip" ? styles.primaryPolicyCard : ""} key={`policy-${result.policy}`}>
              <span>{result.policy === "bakedboston_mip" ? "OPTIMIZATION POLICY" : "COMPARISON POLICY"}</span>
              <h3>{payload.policyMetadata[result.policy]?.label ?? result.policy}</h3>
              <p>{payload.policyMetadata[result.policy]?.description}</p>
            </article>
          ))}
        </div>

        <div className={styles.metricGroups}>
          {metricGroups.map((group) => (
            <section className={styles.metricGroup} key={group.title}>
              <div className={styles.metricGroupHeading}>
                <h3>{group.title}</h3>
                <p>{group.description}</p>
              </div>
              <div className={styles.metricTable} role="table" aria-label={`${group.title} policy comparison`}>
                <div className={styles.metricHeader} role="row">
                  <span>Measure</span>
                  {payload.results.map((result) => <span key={`header-${group.title}-${result.policy}`}>{payload.policyMetadata[result.policy]?.label ?? result.policy}</span>)}
                </div>
                {group.metrics.map((metric) => (
                  <div className={styles.metricRow} role="row" key={metric.key}>
                    <div><strong>{metric.label}</strong><small>{metric.explanation}</small></div>
                    {payload.results.map((result) => (
                      <span className={metricWinner(metric, result) ? styles.bestMetric : ""} key={`${metric.key}-${result.policy}`}>
                        {metric.format(result.metrics[metric.key], result)}
                        {metricWinner(metric, result) ? <small>best</small> : null}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className={styles.methodologyNote}>
          <h3>How to interpret acceptance and rejection</h3>
          <p><strong>How simultaneous recommendation menus are shared:</strong> {payload.selectionRule}</p>
          {payload.recommendationAllocation?.zeroRecommendationRule ? (
            <p>{payload.recommendationAllocation.zeroRecommendationRule}</p>
          ) : null}
          <p>{payload.metricMethodology?.actualSelection ?? "Every simulated driver selects rank #1."}</p>
          <p>{payload.metricMethodology?.acceptanceModel}</p>
          <p>{payload.metricMethodology?.comparison}</p>
          <div className={styles.experimentScale}>
            <div><strong>{payload.network.bakeries.length}</strong><span>bakeries</span></div>
            <div><strong>{payload.network.pantries.length}</strong><span>pantries</span></div>
            <div><strong>{actualDriverRequests}</strong><span>actual driver requests</span></div>
            <div><strong>1–{payload.scenario.maxSimultaneousDrivers}</strong><span>drivers sampled per window</span></div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>{payload.disclaimer}</p>
        <p>
          {resultMode === "saved"
            ? "This is a precomputed academic experiment; it does not run a licensed solver in your browser."
            : "This custom experiment was generated by BakedBoston’s server-side licensed Gurobi service; the solver does not run in your browser."}
        </p>
      </footer>
    </main>
  );
}
