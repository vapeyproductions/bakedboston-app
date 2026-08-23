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

type SimulationDay = {
  serviceDate: string;
  scheduledPickupWindows: number;
  foodAvailablePickups: number;
  openPantryWindows: number;
  driverRequests: number;
  feasibleCandidatesEvaluated: number;
  routesOffered: number;
  routesAccepted: number;
  decisionEpochs: DecisionEpoch[];
};

type PolicyResult = {
  policy: string;
  metrics: Record<string, number>;
  days: SimulationDay[];
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
  };
  runtime: {
    solverBackend: string;
    gurobiVersion: string;
    pythonVersion: string;
  };
  selectionRule: string;
  objectiveWeights: Record<string, number>;
  policyMetadata: Record<string, { label: string; description: string }>;
  results: PolicyResult[];
};

type Props = {
  data: unknown;
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

const interestingEpoch = (day: SimulationDay) => {
  const simultaneous = day.decisionEpochs.findIndex((epoch) => epoch.queueSize > 1 && epoch.candidateCount > 0);
  if (simultaneous >= 0) return simultaneous;
  const feasible = day.decisionEpochs.findIndex((epoch) => epoch.candidateCount > 0);
  return Math.max(feasible, 0);
};

export function SimulatorClient({ data }: Props) {
  const payload = data as SimulationPayload;
  const mip = payload.results.find((result) => result.policy === "bakedboston_mip") ?? payload.results[0];
  const [dayIndex, setDayIndex] = useState(0);
  const [epochIndex, setEpochIndex] = useState(() => interestingEpoch(mip.days[0]));
  const [driverIndex, setDriverIndex] = useState(0);

  const day = mip.days[dayIndex];
  const epoch = day.decisionEpochs[epochIndex] ?? day.decisionEpochs[0];
  const recommendations = epoch.driverRecommendations;
  const activeDriver = recommendations[driverIndex] ?? recommendations[0];
  const selectedRoute = activeDriver?.routes.find((route) => route.selected) ?? activeDriver?.selectedRoute ?? null;

  const comparison = useMemo(
    () =>
      payload.results.map((result) => ({
        id: result.policy,
        label: payload.policyMetadata[result.policy]?.label ?? result.policy,
        description: payload.policyMetadata[result.policy]?.description ?? "",
        completed: result.metrics.completedDeliveries,
        coverage: result.metrics.pickupCoverage,
        drive: result.metrics.averageDriveMinutes,
        priority: result.metrics.averagePantryPriorityServed,
      })),
    [payload],
  );

  const chooseDay = (nextDay: number) => {
    setDayIndex(nextDay);
    setEpochIndex(interestingEpoch(mip.days[nextDay]));
    setDriverIndex(0);
  };

  const chooseEpoch = (nextEpoch: number) => {
    setEpochIndex(nextEpoch);
    const firstWithRoutes = day.decisionEpochs[nextEpoch].driverRecommendations.findIndex(
      (driver) => driver.routes.length > 0,
    );
    setDriverIndex(Math.max(firstWithRoutes, 0));
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

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ACADEMIC ROUTING LAB</p>
          <h1>See every recommendation. Then see what the driver selected.</h1>
          <p className={styles.lede}>
            Replay five synthetic service days. At every decision time, BakedBoston generates feasible routes,
            solves simultaneous driver conflicts with Gurobi, ranks each driver&apos;s remaining options, and selects
            the highest-scoring recommendation.
          </p>
        </div>
        <aside className={styles.heroCard}>
          <span>EXPERIMENT</span>
          <strong>{payload.scenario.horizonDays} days</strong>
          <p>{payload.scenario.driversPerDay} synthetic drivers per day</p>
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
                    ? "The model considers all feasible routes jointly so two drivers cannot claim the same bakery pickup."
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
                        this driver&apos;s conflict-free recommendations.
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
          <p>Every policy receives the same synthetic five-day events.</p>
        </div>
        <div className={styles.comparisonTable} role="table" aria-label="Routing policy comparison">
          <div className={styles.comparisonHeader} role="row">
            <span>Policy</span><span>Completed</span><span>Coverage</span><span>Avg. drive</span><span>Avg. priority</span>
          </div>
          {comparison.map((policy) => (
            <div className={`${styles.comparisonRow} ${policy.id === "bakedboston_mip" ? styles.primaryPolicy : ""}`} role="row" key={policy.id}>
              <div><strong>{policy.label}</strong><small>{policy.description}</small></div>
              <span>{policy.completed}</span>
              <span>{(policy.coverage * 100).toFixed(0)}%</span>
              <span>{policy.drive.toFixed(1)} min</span>
              <span>{policy.priority.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <p>{payload.disclaimer}</p>
        <p>This page replays a precomputed academic experiment; it does not run a licensed solver in your browser.</p>
      </footer>
    </main>
  );
}
