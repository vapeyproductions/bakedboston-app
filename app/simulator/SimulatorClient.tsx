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
  finishAt: string;
  driveMinutes: number;
  waitingMinutes: number;
  destinationMinutes: number;
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

type DecisionEpoch = {
  decisionEpoch: string;
  requests: string[];
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

const formatClock = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(`${value}T12:00:00-04:00`));

const score = (value: number) => value.toFixed(2);
const compactDriver = (driverId: string) => driverId.replace("synthetic-driver-", "Driver ");

const percent = (value: number | null | undefined, digits = 0) =>
  typeof value === "number" ? `${(value * 100).toFixed(digits)}%` : "—";

const numeric = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" ? value.toFixed(digits) : "—";

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
      { key: "averageWaitingMinutes", label: "Mean waiting time", explanation: "Average idle time before or between service windows.", direction: "lower", format: (value) => `${numeric(value)} min` },
      { key: "averageTotalTripDurationMinutes", label: "Mean total trip duration", explanation: "Driving, waiting, pickup, and drop-off time combined.", direction: "lower", format: (value) => `${numeric(value)} min` },
    ],
  },
  {
    title: "Acceptance and rejection",
    description: "Selections are deterministic in this academic replay; behavioral measures remain model-based diagnostics.",
    metrics: [
      { key: "driverAcceptanceRate", label: "Driver acceptance (simulated)", explanation: "Share selecting rank #1 in this replay.", direction: "higher", format: (value) => percent(value) },
      { key: "expectedDriverAcceptanceRate", label: "Expected acceptance", explanation: "Behavioral estimate based on route burden and fit.", direction: "higher", format: (value) => percent(value, 1) },
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
  const simultaneous = day.decisionEpochs.findIndex((epoch) => epoch.queueSize > 1 && epoch.candidateCount > 0);
  if (simultaneous >= 0) return simultaneous;
  const feasible = day.decisionEpochs.findIndex((epoch) => epoch.candidateCount > 0);
  return Math.max(feasible, 0);
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
  const [dayIndex, setDayIndex] = useState(0);
  const [epochIndex, setEpochIndex] = useState(() => interestingEpoch(mip.days[0]));
  const [driverIndex, setDriverIndex] = useState(0);
  const [mapMode, setMapMode] = useState<"driver" | "window">("driver");

  const day = mip.days[dayIndex] ?? mip.days[0];
  const epoch = day.decisionEpochs[epochIndex] ?? day.decisionEpochs[0];
  const recommendations = epoch.driverRecommendations;
  const activeDriver = recommendations[driverIndex] ?? recommendations[0];
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

  const bakeryHoverLabel = (bakeryName: string, pickupId?: string) => {
    const available = pickupWindowsByBakery.get(bakeryName) ?? [];
    const exact = pickupId ? available.filter((item) => item.pickupId === pickupId) : available;
    const windows = exact.length ? exact : available;
    if (!windows.length) return `${bakeryName} · bakery\nNo food-ready pickup window on ${formatDate(day.serviceDate)}`;
    return `${bakeryName} · bakery\n${windows
      .map((item) => `Pickup: ${formatClock(item.readyAt)}–${formatClock(item.pickupDeadline)}`)
      .join("\n")}`;
  };

  const pantryHoverLabel = (pantryName: string, pantryWindowId?: string) => {
    const available = pantryWindowsByPantry.get(pantryName) ?? [];
    const exact = pantryWindowId ? available.filter((item) => item.pantryWindowId === pantryWindowId) : available;
    const windows = exact.length ? exact : available;
    if (!windows.length) return `${pantryName} · pantry\nNo receiving window on ${formatDate(day.serviceDate)}`;
    return `${pantryName} · pantry\n${windows
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
  }, [mapRoutes, payload.network]);

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
  };

  const resetReplay = (nextPayload: SimulationPayload) => {
    const nextMip = nextPayload.results.find((result) => result.policy === "bakedboston_mip") ?? nextPayload.results[0];
    const nextEpoch = interestingEpoch(nextMip.days[0]);
    const firstWithRoutes = nextMip.days[0].decisionEpochs[nextEpoch].driverRecommendations.findIndex(
      (driver) => driver.routes.length > 0,
    );
    setDayIndex(0);
    setEpochIndex(nextEpoch);
    setDriverIndex(Math.max(firstWithRoutes, 0));
    setMapMode("driver");
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
              <label className={styles.controlField}>
                <span>Simulation days</span>
                <select aria-label="Simulation days" onChange={(event) => updateCustomConfig("horizonDays", Number(event.target.value))} value={customConfig.horizonDays}>
                  <option value="3">3 days</option>
                  <option value="4">4 days</option>
                  <option value="5">5 days</option>
                </select>
              </label>
              <label className={styles.controlField}>
                <span>Maximum drivers in one window</span>
                <select aria-label="Maximum simultaneous drivers" onChange={(event) => updateCustomConfig("maxSimultaneousDrivers", Number(event.target.value))} value={customConfig.maxSimultaneousDrivers}>
                  <option value="2">2 drivers</option>
                  <option value="3">3 drivers</option>
                </select>
                <small>Each window randomly receives 1–{customConfig.maxSimultaneousDrivers} drivers.</small>
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
          <p>Each decision window samples 1–{payload.scenario.maxSimultaneousDrivers} drivers</p>
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
                <div><strong>{(epoch.solver.runtimeSeconds * 1000).toFixed(1)} ms</strong><span>solve time</span></div>
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
                  {payload.network.bakeries.map((node) => {
                    const point = mapProjection(node);
                    return <circle className={styles.networkBakery} cx={point.x} cy={point.y} key={node.id} r="6"><title>{bakeryHoverLabel(node.name)}</title></circle>;
                  })}
                  {payload.network.pantries.map((node) => {
                    const point = mapProjection(node);
                    return <rect className={styles.networkPantry} height="10" key={node.id} rx="2" width="10" x={point.x - 5} y={point.y - 5}><title>{pantryHoverLabel(node.name)}</title></rect>;
                  })}
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
                    return (
                      <g key={`nodes-${route.requestId}-${route.pickupId}-${route.pantryWindowId}`}>
                        <g transform={`translate(${driver.x} ${driver.y})`}><circle className={styles.driverNode} r="17" /><text className={styles.mapEmoji} textAnchor="middle" y="7">🚗</text><title>{compactDriver(route.driverId)}</title></g>
                        <g transform={`translate(${bakery.x} ${bakery.y})`}><circle className={styles.bakeryNode} r="17" /><text className={styles.mapEmoji} textAnchor="middle" y="7">🥖</text><title>{bakeryHoverLabel(route.bakeryName, route.pickupId)}</title></g>
                        <g transform={`translate(${pantry.x} ${pantry.y})`}><circle className={styles.pantryNode} r="17" /><text className={styles.mapEmoji} textAnchor="middle" y="7">🥫</text><title>{pantryHoverLabel(route.pantryName, route.pantryWindowId)}</title></g>
                        {route.selected || mapMode === "window" ? <>
                          <text className={styles.mapNodeLabel} textAnchor="middle" x={bakery.x} y={bakery.y - 27}>{route.bakeryName}</text>
                          <text className={styles.mapNodeLabel} textAnchor="middle" x={pantry.x} y={pantry.y - 27}>{route.pantryName}</text>
                        </> : null}
                      </g>
                    );
                  })}
                </svg>
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
                  </div>
                  <span>Top {activeDriver.routes.length}</span>
                </div>

                <div className={styles.routeList}>
                  {activeDriver.routes.map((route) => (
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
                        <div className={styles.routeDetails}>
                          <span>Depart {formatClock(route.departAt)}</span>
                          <span>{route.driveMinutes.toFixed(1)} drive min</span>
                          <span>{route.waitingMinutes.toFixed(1)} wait min</span>
                          <span>Priority {route.pantryPriority.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className={styles.routeScore}>
                        <small>ROUTE SCORE</small>
                        <strong>{score(route.routeScore)}</strong>
                        {route.selected ? <span>SELECTED · HIGHEST</span> : null}
                      </div>
                    </article>
                  ))}
                </div>

                {selectedRoute ? (
                  <div className={styles.selectionSummary}>
                    <span className={styles.check}>✓</span>
                    <div>
                      <p className={styles.panelLabel}>DRIVER SELECTION</p>
                      <h3>{selectedRoute.bakeryName} → {selectedRoute.pantryName}</h3>
                      <p>
                        Rank #1 was selected because its score of {score(selectedRoute.routeScore)} is the highest among
                        this driver&apos;s conflict-free recommendations. Pantry destinations may repeat across drivers,
                        but bakery pickups cannot.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span>∅</span>
                <h3>No route was recommended to {activeDriver ? compactDriver(activeDriver.driverId) : "this driver"}.</h3>
                <p>At this decision time, no remaining bakery–pantry combination satisfied every timing and assignment constraint.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.method}>
        <div>
          <p className={styles.eyebrow}>WHAT THE SCORE MEANS</p>
          <h2>Priority is rewarded. Route burden is penalized.</h2>
        </div>
        <div className={styles.formula}>
          <span>route score =</span>
          <strong>{payload.objectiveWeights.pantry_priority_reward} × pantry priority</strong>
          <i>−</i>
          <strong>{payload.objectiveWeights.drive_minute_penalty} × drive minutes</strong>
          <i>−</i>
          <strong>{payload.objectiveWeights.waiting_minute_penalty} × wait minutes</strong>
          <i>−</i>
          <strong>{payload.objectiveWeights.destination_minute_penalty} × destination deviation</strong>
        </div>
        <p className={styles.formulaNote}>
          A raw score can be negative when travel and waiting penalties exceed the pantry-priority reward. That does
          not make a route invalid—the model still ranks feasible routes by score and selects the highest one available.
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
