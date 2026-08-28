"use client";

import { useEffect, useState } from "react";

const APP_STORE_URL = "https://apps.apple.com/us/app/bakedboston/id6795673575";
const APP_STORE_QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(APP_STORE_URL)}`;

type DemoStep = {
  id: string;
  label: string;
  title: string;
  description: string;
  scoreTitle: string;
  scoreValue: string;
  scoreNote: string;
  mipTitle: string;
  mipBody: string;
  mipLines: string[];
  mipEquation: string;
};

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

type DemoRoute = {
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

type DemoDataset = {
  nodes: DemoNode[];
  candidates: DemoRoute[];
  highlightedRouteId: string | null;
  liveRouteLabel: string;
  liveRouteContext: string;
  request: DemoRequest;
};

type DemoPoint = { x: number; y: number };

const DEMO_REQUEST_RADIUS = 7;

function parseDemoRoutePoints(points: string): [DemoPoint, DemoPoint, DemoPoint] | null {
  const parsed = points.trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return { x, y };
  });

  if (parsed.length !== 3 || parsed.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return null;
  }

  return parsed as [DemoPoint, DemoPoint, DemoPoint];
}

function quadraticControl(start: DemoPoint, end: DemoPoint, bend: number): DemoPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(Math.hypot(dx, dy), 0.001);

  return {
    x: (start.x + end.x) / 2 - (dy / length) * bend,
    y: (start.y + end.y) / 2 + (dx / length) * bend,
  };
}

function quadraticPoint(start: DemoPoint, control: DemoPoint, end: DemoPoint, t: number): DemoPoint {
  const remaining = 1 - t;
  return {
    x: remaining * remaining * start.x + 2 * remaining * t * control.x + t * t * end.x,
    y: remaining * remaining * start.y + 2 * remaining * t * control.y + t * t * end.y,
  };
}

function getDemoRouteGeometry(route: DemoRoute) {
  const points = parseDemoRoutePoints(route.points);
  if (!points) {
    return { path: "", badgeLeft: route.labelLeft, badgeTop: route.labelTop };
  }

  const [driver, bakery, pantry] = points;
  const routeIndex = Math.max(0, route.label.charCodeAt(0) - 65);
  const firstLegBends = [-7, 7, -3.5, 3.5, 0];
  const secondLegBends = [-4, 4, -7, 7, 0];
  const badgePositions = [0.45, 0.55, 0.48, 0.52, 0.6];
  const firstControl = quadraticControl(driver, bakery, firstLegBends[routeIndex] ?? 0);
  const secondControl = quadraticControl(bakery, pantry, secondLegBends[routeIndex] ?? 0);
  const badgePoint = quadraticPoint(bakery, secondControl, pantry, badgePositions[routeIndex] ?? 0.52);

  return {
    path: `M ${driver.x} ${driver.y} Q ${firstControl.x.toFixed(2)} ${firstControl.y.toFixed(2)} ${bakery.x} ${bakery.y} Q ${secondControl.x.toFixed(2)} ${secondControl.y.toFixed(2)} ${pantry.x} ${pantry.y}`,
    badgeLeft: `${badgePoint.x.toFixed(2)}%`,
    badgeTop: `${badgePoint.y.toFixed(2)}%`,
  };
}

function pointAtRequestBoundary(point: DemoPoint, center: DemoPoint, radius: number) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) return point;
  return {
    x: center.x + (dx / distance) * radius,
    y: center.y + (dy / distance) * radius,
  };
}

function getSpatialDeviationLines(route: DemoRoute, request: DemoRequest) {
  const points = parseDemoRoutePoints(route.points);
  if (!points) return [];
  const [, bakery, pantry] = points;
  const startCenter = {
    x: Number.parseFloat(request.startLeft),
    y: Number.parseFloat(request.startTop),
  };
  const destinationCenter = {
    x: Number.parseFloat(request.destinationLeft),
    y: Number.parseFloat(request.destinationTop),
  };
  const lines: Array<{ id: string; from: DemoPoint; to: DemoPoint; label: string }> = [];
  if (route.originDeviationMiles > 0) {
    lines.push({
      id: "origin",
      from: bakery,
      to: pointAtRequestBoundary(bakery, startCenter, DEMO_REQUEST_RADIUS),
      label: `${route.originDeviationMiles.toFixed(1)} mi outside start ZIP area`,
    });
  }
  if (route.destinationDeviationMiles > 0) {
    lines.push({
      id: "destination",
      from: pantry,
      to: pointAtRequestBoundary(pantry, destinationCenter, DEMO_REQUEST_RADIUS),
      label: `${route.destinationDeviationMiles.toFixed(1)} mi outside destination ZIP area`,
    });
  }
  return lines;
}

function getDemoRouteUtility(route: DemoRoute) {
  const priorityPoints = 45 * route.priority;
  const drivePenalty = route.driveMinutes;
  const timePenalty = 24 * route.requestedTimeDeviationRatio;
  const spatialPenalty = 18 * route.normalizedSpatialDeviation;

  return {
    priorityPoints,
    drivePenalty,
    timePenalty,
    spatialPenalty,
    total: priorityPoints - drivePenalty - timePenalty - spatialPenalty,
  };
}

const pins = [
  { label: "Flour & Field", type: "B", left: "18%", top: "28%", color: "#ef6548" },
  { label: "Harbor Pantry", type: "P", left: "67%", top: "18%", color: "#163d2d" },
  { label: "Morning Bell", type: "B", left: "28%", top: "68%", color: "#f4bf43" },
  { label: "Northside Shelf", type: "P", left: "80%", top: "66%", color: "#163d2d" },
  { label: "Grain House", type: "B", left: "50%", top: "48%", color: "#ef6548" },
  { label: "St. Anne's", type: "P", left: "63%", top: "77%", color: "#163d2d" },
];

const demoSteps: DemoStep[] = [
  {
    id: "network",
    label: "1 · Decision epoch",
    title: "A driver request triggers a new decision epoch.",
    description: "Logging in does not mean leaving immediately. The model takes a snapshot of open and upcoming partner windows plus the driver’s requested time interval, start area, and destination area.",
    scoreTitle: "Network snapshot",
    scoreValue: "Partners + driver request",
    scoreNote: "The model schedules the best departure time; planned lead time is not treated as route burden",
    mipTitle: "Route alternative",
    mipBody: "A binary alternative represents one driver request, one bakery pickup occurrence, one pantry receiving window, and one candidate departure time.",
    mipLines: [
      "Requested intervals are at least 30 minutes and may begin now or later",
      "The start and destination requests use two-mile preference radii",
      "Preferred time and locations are soft preferences",
      "Every candidate has its own complete service timeline",
    ],
    mipEquation: "yᵣ = 1 when timed route alternative r is selected",
  },
  {
    id: "feasibility",
    label: "2 · Timed feasibility",
    title: "The model builds complete, feasible timelines.",
    description: "For each bakery–pantry pair, the model tests smart departure breakpoints and keeps only schedules that can complete pickup, loading, travel, arrival, and unloading within the hard operating windows.",
    scoreTitle: "Hard feasibility screen",
    scoreValue: "Infeasible routes removed",
    scoreNote: "Soft driver preferences affect ranking, but never replace partner operating constraints",
    mipTitle: "Timed route construction",
    mipBody: "Each candidate includes a scheduled departure rather than assuming the driver leaves at login. Five minutes are reserved for loading at the bakery and five minutes for unloading at the pantry.",
    mipLines: [
      "departure cannot occur before the driver logs in",
      "pickup must fall inside the confirmed bakery window",
      "pantry arrival must precede its latest permitted arrival",
      "the full route timeline must remain operationally feasible",
    ],
    mipEquation: "login ≤ depart; pickup ≤ deadline; pantry arrival ≤ latest arrival; requested interval remains soft",
  },
  {
    id: "utility",
    label: "3 · Route utility",
    title: "Every feasible timed route receives a utility score.",
    description: "Priority is rewarded. Driving, proportional requested-time deviation, and normalized distance outside the requested start and destination ZIP areas are penalized. Exact ZIP-area fit receives no bonus; it simply contributes zero spatial penalty.",
    scoreTitle: "Unscaled utility",
    scoreValue: "Comparable—not a probability",
    scoreNote: "A negative score can still be feasible; it simply ranks below a higher-scoring alternative",
    mipTitle: "Candidate utility",
    mipBody: "The exact academic scoring function is shown below. It is used consistently for ranking and assignment rather than converted to a cosmetic 0–100 scale.",
    mipLines: [
      "+45 × pantry priority",
      "−1.00 × driving minutes",
      "−24 × fraction of the requested interval missed",
      "−18 × normalized start/end ZIP-area deviation",
      "0 reward for exact or inside-area fit",
      "planned departure lead remains scheduling guidance only",
    ],
    mipEquation: "qᵣ = 45Pᵣ − Dᵣ − 24Oᵣ − 18Sᵣ",
  },
  {
    id: "assignment",
    label: "4 · Joint assignment",
    title: "Gurobi optimizes all active drivers together.",
    description: "The system first maximizes the number of completed pickups. Among those maximum-coverage solutions, it maximizes total route utility. This prevents a slightly better score from sacrificing a feasible donation.",
    scoreTitle: "Lexicographic objectives",
    scoreValue: "1. Coverage  2. Quality",
    scoreNote: "Coverage has strict priority over the utility tie-breaker",
    mipTitle: "Network MIP",
    mipBody: "Binary selections are coordinated across the decision epoch so a driver and bakery pickup occurrence cannot be assigned twice. Pantries remain able to receive multiple deliveries while open.",
    mipLines: [
      "at most one selected route per driver request",
      "at most one selected route per bakery pickup occurrence",
      "pantry windows are not treated as single-capacity resources",
    ],
    mipEquation: "lexicographic max: ① Σyᵣ  ② Σqᵣyᵣ",
  },
  {
    id: "recommendations",
    label: "5 · Recommendations",
    title: "Fair, deconflicted route menus are offered to drivers.",
    description: "For simultaneous drivers, Gurobi gives as many feasible drivers as possible one option before adding second choices. A bakery pickup is not shown in two active menus at once. The academic replay then selects the driver’s highest-scoring option.",
    scoreTitle: "Recommendation policy",
    scoreValue: "One each before extras",
    scoreNote: "After a selection, rejection, or timeout, the next decision epoch is solved again",
    mipTitle: "Menu allocation",
    mipBody: "Each recommendation layer first maximizes the number of drivers receiving an option, then maximizes utility among those maximum-cardinality menus.",
    mipLines: [
      "no feasible driver is left at zero merely to give another driver extras",
      "shared bakery occurrences are deconflicted",
      "the simulator deterministically chooses rank #1",
    ],
    mipEquation: "per layer: ① max drivers served  ② max recommendation utility",
  },
];

const fallbackDemoNodes: DemoNode[] = [
  { id: "bakery-lena", label: "Lena's Bakery", type: "Bakery", short: "🥖", left: "21%", top: "56%", postalCode: "02458" },
  { id: "bakery-harbor", label: "Harbor Bakes", type: "Bakery", short: "🥖", left: "32%", top: "28%", postalCode: "02113" },
  { id: "pantry-moughan", label: "Moughan Food Pantry", type: "Pantry", short: "🥫", left: "72%", top: "41%", postalCode: "02458" },
  { id: "pantry-north-end", label: "North End Pantry", type: "Pantry", short: "🥫", left: "76%", top: "21%", postalCode: "02113" },
  { id: "pantry-roxbury", label: "Roxbury Pantry", type: "Pantry", short: "🥫", left: "58%", top: "72%", postalCode: "02119" },
  { id: "driver-request", label: "Driver request", type: "Driver", short: "🚗", left: "46%", top: "62%" },
  { id: "closed-bakery", label: "North Station Bakes", type: "Bakery", short: "🥖", left: "8%", top: "10%", postalCode: "02114", isClosed: true },
  { id: "closed-pantry", label: "Harbor Shelf Pantry", type: "Pantry", short: "🥫", left: "93%", top: "90%", postalCode: "02128", isClosed: true },
];

const fallbackDemoRoutes: DemoRoute[] = [
  {
    id: "route-a", label: "A", bakery: "Lena's Bakery", pantry: "Moughan Food Pantry", drive: "3.2 mi", score: "17.0",
    distanceMiles: 3.2, driverDistanceMiles: 0.8, driveMinutes: 18, priority: 0.82, servedOpportunities: 1, receivingOpportunities: 9,
    originWaitMinutes: 123, requestedTimeDeviationMinutes: 0, requestedWindowMinutes: 30, requestedTimeDeviationRatio: 0,
    originDeviationMiles: 0, destinationDeviationMiles: 0, normalizedOriginDeviation: 0, normalizedDestinationDeviation: 0, normalizedSpatialDeviation: 0,
    departureLabel: "4:20 PM", pickupLabel: "4:32 PM", arrivalLabel: "4:45 PM", finishLabel: "4:50 PM",
    points: "46,62 21,56 72,41", labelLeft: "48%", labelTop: "40%",
  },
  {
    id: "route-b", label: "B", bakery: "Harbor Bakes", pantry: "North End Pantry", drive: "4.8 mi", score: "5.1",
    distanceMiles: 4.8, driverDistanceMiles: 1.6, driveMinutes: 22, priority: 0.72, servedOpportunities: 2, receivingOpportunities: 9,
    originWaitMinutes: 128, requestedTimeDeviationMinutes: 5, requestedWindowMinutes: 30, requestedTimeDeviationRatio: 5 / 30,
    originDeviationMiles: 0.8, destinationDeviationMiles: 0.4, normalizedOriginDeviation: 0.2, normalizedDestinationDeviation: 0.05, normalizedSpatialDeviation: 0.125,
    departureLabel: "4:25 PM", pickupLabel: "4:42 PM", arrivalLabel: "5:00 PM", finishLabel: "5:05 PM",
    points: "46,62 32,28 76,21", labelLeft: "60%", labelTop: "28%",
  },
  {
    id: "route-d", label: "D", bakery: "Harbor Bakes", pantry: "Roxbury Pantry", drive: "5.6 mi", score: "-3.3",
    distanceMiles: 5.6, driverDistanceMiles: 1.6, driveMinutes: 31, priority: 0.76, servedOpportunities: 1, receivingOpportunities: 7,
    originWaitMinutes: 113, requestedTimeDeviationMinutes: 0, requestedWindowMinutes: 30, requestedTimeDeviationRatio: 0,
    originDeviationMiles: 0.8, destinationDeviationMiles: 4.5, normalizedOriginDeviation: 0.2, normalizedDestinationDeviation: 0.56, normalizedSpatialDeviation: 0.38,
    departureLabel: "4:10 PM", pickupLabel: "4:27 PM", arrivalLabel: "4:51 PM", finishLabel: "4:56 PM",
    points: "46,62 32,28 58,72", labelLeft: "49%", labelTop: "54%",
  },
  {
    id: "route-c", label: "C", bakery: "Lena's Bakery", pantry: "Roxbury Pantry", drive: "5.1 mi", score: "-15.2",
    distanceMiles: 5.1, driverDistanceMiles: 0.8, driveMinutes: 25, priority: 0.60, servedOpportunities: 3, receivingOpportunities: 8,
    originWaitMinutes: 118, requestedTimeDeviationMinutes: 15, requestedWindowMinutes: 30, requestedTimeDeviationRatio: 0.5,
    originDeviationMiles: 0, destinationDeviationMiles: 5.2, normalizedOriginDeviation: 0, normalizedDestinationDeviation: 0.65, normalizedSpatialDeviation: 0.325,
    departureLabel: "4:15 PM", pickupLabel: "4:27 PM", arrivalLabel: "5:10 PM", finishLabel: "5:15 PM",
    points: "46,62 21,56 58,72", labelLeft: "44%", labelTop: "70%",
  },
  {
    id: "route-e", label: "E", bakery: "Lena's Bakery", pantry: "North End Pantry", drive: "6.2 mi", score: "-15.5",
    distanceMiles: 6.2, driverDistanceMiles: 0.8, driveMinutes: 28, priority: 0.55, servedOpportunities: 4, receivingOpportunities: 9,
    originWaitMinutes: 108, requestedTimeDeviationMinutes: 12, requestedWindowMinutes: 30, requestedTimeDeviationRatio: 0.4,
    originDeviationMiles: 0, destinationDeviationMiles: 2, normalizedOriginDeviation: 0, normalizedDestinationDeviation: 0.25, normalizedSpatialDeviation: 0.125,
    departureLabel: "4:05 PM", pickupLabel: "4:17 PM", arrivalLabel: "5:07 PM", finishLabel: "5:12 PM",
    points: "46,62 21,56 76,21", labelLeft: "55%", labelTop: "35%",
  },
];

const fallbackDemoData: DemoDataset = {
  nodes: fallbackDemoNodes,
  candidates: fallbackDemoRoutes,
  highlightedRouteId: "route-a",
  liveRouteLabel: "Lena's Bakery → Moughan Food Pantry",
  liveRouteContext: "Illustrative timed solve using the current network map; schedules and the driver request are synthetic.",
  request: {
    loginLabel: "2:17 PM",
    preferredStartLabel: "4:30 PM",
    preferredFinishLabel: "5:00 PM",
    requestedWindowMinutes: 30,
    startLabel: "Requested start ZIP",
    startZipCode: "02458",
    startRadiusMiles: 2,
    startLeft: "42%",
    startTop: "62%",
    destinationLabel: "Requested destination ZIP",
    destinationZipCode: "02458",
    destinationRadiusMiles: 2,
    destinationLeft: "76%",
    destinationTop: "42%",
  },
};

export default function Home() {
  const [network, setNetwork] = useState({ bakeries: 0, pantries: 0, drivers: 0, completedThisWeek: 0, completedTotal: 0, averagePantriesHelpedPerDay: 0 });
  const [demoStepIndex, setDemoStepIndex] = useState(0);
  const [demoData, setDemoData] = useState<DemoDataset>(fallbackDemoData);
  const scrollToModel = () => document.getElementById("model")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const scrollToDemo = () => document.getElementById("live-demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const activeDemoStep = demoSteps[demoStepIndex];
  const chosenRouteId = demoData.highlightedRouteId ?? demoData.candidates[0]?.id ?? null;
  const activeNodeIds = activeDemoStep.id === "network"
    ? demoData.nodes.map((node) => node.id)
    : demoData.nodes.filter((node) => !node.isClosed).map((node) => node.id);
  const activeRoutes = activeDemoStep.id === "network" || activeDemoStep.id === "feasibility"
    ? []
    : demoData.candidates.map((route) => route.id);
  const networkNodeCount = demoData.nodes.length;
  const eligibleNodeCount = demoData.nodes.filter((node) => !node.isClosed).length;
  const scoredRouteCount = ["utility", "assignment", "recommendations"].includes(activeDemoStep.id)
    ? demoData.candidates.length
    : 0;
  const selectedRouteCount = ["assignment", "recommendations"].includes(activeDemoStep.id) && chosenRouteId ? 1 : 0;
  const activeFunnelMetric = activeDemoStep.id === "network"
    ? "network"
    : activeDemoStep.id === "feasibility"
      ? "eligible"
      : activeDemoStep.id === "utility"
        ? "scored"
        : "selected";

  useEffect(() => {
    void fetch("/api/public/stats", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (data) setNetwork(data); });
    void fetch("/api/public/demo-network", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      if (data?.nodes?.length && data?.candidates?.length) setDemoData(data);
    });
  }, []);

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top" aria-label="BakedBoston home">
          <span className="brandMark">B</span>
          <span>BakedBoston</span>
        </a>
        <div className="navLinks">
          <a href="#how">How it works</a>
          <a href="#impact">Impact</a>
          <button type="button" onClick={scrollToModel}>The model</button>
          <button type="button" onClick={scrollToDemo}>Live demo</button>
          <a href="/simulator">Simulator</a>
          <a href="/partners">Partner portal</a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="heroCopy">
          <div className="eyebrow"><span /> Sustainable logistics, powered by community</div>
          <h1>Good food.<br /><em>Better routes.</em><br />Zero waste.</h1>
          <p>We match bakery surplus with nearby food pantries—and give volunteer drivers the smartest route to get it there fresh.</p>
          <div className="heroActions">
            <button className="primary" onClick={() => document.getElementById("routes")?.scrollIntoView({ behavior: "smooth" })}>Volunteer to drive <span>↗</span></button>
            <button className="textButton" onClick={scrollToModel}>See how routing works <span>↓</span></button>
          </div>
          <div className="trustRow">
            <div className="avatars"><span>JM</span><span>AK</span><span>SR</span><span>+42</span></div>
            <p><strong>{network.drivers} neighbors</strong><br />ready to drive this week</p>
          </div>
        </div>

        <div className="mapCard" aria-label="Optimized rescue route map">
          <div className="mapTop">
            <span className="live"><i /> LIVE NETWORK</span>
            <span>Sat, Jul 25 · Boston</span>
          </div>
          <div className="mapGrid">
            <div className="waterShape" />
            <div className="parkShape" />
            <div className="routeLine routeOne" />
            <div className="routeLine routeTwo" />
            <div className="routeLine routeThree" />
            {pins.map((pin) => (
              <div className="pinWrap" key={pin.label} style={{ left: pin.left, top: pin.top }}>
                <span className="pin" style={{ background: pin.color }}>{pin.type}</span>
                <small>{pin.label}</small>
              </div>
            ))}
            <div className="driverCar">🚗<span>YOU</span></div>
          </div>
          <div className="routeSummary">
            <div><small>OPTIMIZED LOOP</small><strong>3.2 mi <span>·</span> 30 min</strong></div>
            <div className="summaryImpact"><strong>{network.bakeries}</strong><small>registered bakeries</small></div>
            <div className="summaryImpact"><strong>{network.pantries}</strong><small>registered pantries</small></div>
          </div>
        </div>
      </section>

      <section className="impactBar" id="impact">
        <div><strong>{network.completedThisWeek}</strong><span>deliveries completed this week</span></div>
        <div><strong>{network.completedTotal}</strong><span>all-time deliveries completed</span></div>
        <div><strong>{network.averagePantriesHelpedPerDay}</strong><span>average pantries helped per day</span></div>
      </section>

      <section className="routesSection" id="routes">
        <div className="sectionHeading">
          <div>
            <span className="kicker">VOLUNTEER TO DRIVE</span>
            <h2>One app. A meaningful trip.</h2>
          </div>
          <p>Driver participation happens in the BakedBoston mobile app, so you can choose a route when it fits your day.</p>
        </div>
        <div className="driverRoadmap">
          <div className="roadmapSteps">
            <div><span>1</span><b>✍️ Sign up</b><p>Create your driver profile.</p></div>
            <div><span>2</span><b>🪪 Verify ID</b><p>A secure check that takes about two minutes.</p></div>
            <div><span>3</span><b>📍 Choose a route</b><p>Select a nearby order now, or reserve one for a preferred route and time.</p></div>
            <div><span>4</span><b>🥖 Pick up</b><p>Drive to the bakery and collect the food.</p></div>
            <div><span>5</span><b>🥫 Drop off</b><p>Bring it to the pantry and complete the delivery.</p></div>
          </div>
          <a
            className="appQr"
            href={APP_STORE_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Download BakedBoston on the App Store"
          >
            <img className="qrImage" src={APP_STORE_QR_URL} alt="QR code to download BakedBoston on the App Store" />
            <strong>Scan to download<br />the BakedBoston app</strong>
            <small>Driver routes are mobile-only. Tap or scan to open the App Store.</small>
          </a>
        </div>
      </section>

      <section className="howSection" id="how">
        <div className="howIntro"><span className="kicker">WHY BAKEDBOSTON</span><h2>From surplus<br />to supper.</h2><p>A simple act, coordinated intelligently.</p></div>
        <div className="howStory">
          <p className="howStoryLead">Edible food is often discarded because a bakery cannot move it in the narrow window when it is still fresh—at the same time that local food-access organizations are under growing pressure. BakedBoston coordinates the people, places, and timing needed to turn that gap into a reliable delivery.</p>
          <div className="problemStats">
            <a href="https://magazinebbm.com/blog/food-waste-and-the-problem-of-bakery-product-loss-4003" target="_blank" rel="noreferrer" className="problemStat">
              <strong>10–25%</strong><span>of bakery product can be discarded each day.<i>Source ↗</i></span>
            </a>
            <a href="https://foodaccessreport.gbfb.org/the-state-of-food-insecurity" target="_blank" rel="noreferrer" className="problemStat">
              <strong>40%</strong><span>of Massachusetts households experienced food insecurity in 2025.<i>Source ↗</i></span>
            </a>
          </div>
        </div>
        <div className="steps">
          <div><span>01</span><div className="stepIcon">🥖</div><h3>Bakeries post surplus</h3><p>Pickup timing, confirmation status, and access details are added in under a minute.</p></div>
          <div><span>02</span><div className="stepIcon">✦</div><h3>We optimize the match</h3><p>The MIP enforces partner windows, maximizes pickup coverage, then balances pantry priority, driving, and driver time and location fit.</p></div>
          <div><span>03</span><div className="stepIcon">🚙</div><h3>Neighbors drive the loop</h3><p>Volunteers claim a route and deliver food while it’s still fresh.</p></div>
        </div>
      </section>

      <section className="modelSection" id="model">
        <div>
          <span className="kicker light">THE OPERATIONS RESEARCH</span>
          <h2>Less waste is<br />a solvable problem.</h2>
        </div>
        <div className="modelCopy">
          <p>BakedBoston uses a Gurobi mixed-integer model to choose among complete, feasible driver–bakery–pantry plans. Each alternative includes a just-in-time departure, five minutes to load at the bakery, the trip to the pantry, and five minutes to unload.</p>
          <div className="modelObjective">
            <div className="modelObjectiveStage">
              <small>Objective 1 · strict priority</small>
              <strong>maximize <b>Σ yᵣ</b></strong>
              <p>Assign as many eligible bakery pickup occurrences as possible.</p>
            </div>
            <div className="modelObjectiveStage">
              <small>Objective 2 · among maximum-coverage solutions</small>
              <strong>maximize <b>Σ qᵣ yᵣ</b></strong>
              <p>Choose the maximum-total-utility assignment without sacrificing pickup coverage.</p>
            </div>
            <div className="modelRouteUtility">
              <small>Utility of route r</small>
              <strong>qᵣ = 45Pᵣ − Dᵣ − 24Oᵣ − 18Sᵣ</strong>
            </div>
          </div>
          <p className="modelFactorIntro">The coefficients are policy weights, not percentages. Hard feasibility is enforced before scoring, so an attractive score can never override a closed window or missed deadline.</p>
          <div className="modelFactorGrid">
            <div className="modelFactor"><strong>yᵣ · assignment</strong><p>A binary variable: 1 when complete timed route r is selected, otherwise 0.</p></div>
            <div className="modelFactor"><strong>Pᵣ · pantry priority</strong><p>Priority is <b>1 − (recent deliveries + 1) ÷ (recent receiving opportunities + 2)</b>. A pantry that was available but less often served receives more credit.</p></div>
            <div className="modelFactor"><strong>Dᵣ · driving burden</strong><p>Total traffic-aware driving minutes from the driver’s origin to the bakery and from the bakery to the pantry.</p></div>
            <div className="modelFactor"><strong>Oᵣ · requested-time deviation</strong><p>Minutes the route begins before or finishes after the preferred interval, divided by requested-window minutes. A miss therefore matters more when the driver gave a tight window.</p></div>
            <div className="modelFactor"><strong>Sᵣ · requested-location deviation</strong><p>Distance outside the requested start and destination ZIP radii, normalized against the driver’s other feasible routes and averaged across supplied location preferences. Inside the area means zero penalty—not a bonus.</p></div>
          </div>
          <div className="modelDetails">
            <div><strong>Planned departure</strong><p>Login time is the decision epoch, not a forced departure. The model schedules the latest feasible departure, so planned lead time at the origin is not penalized.</p></div>
            <div><strong>Hard constraints</strong><p>Confirmed partner windows, bakery pickup deadlines, pantry latest arrivals, full travel and service timing, at most one route per driver request, and at most one assignment per bakery pickup.</p></div>
            <div><strong>Simultaneous drivers</strong><p>Recommendation menus are allocated with coverage-first fairness and then utility. Active menus never duplicate a bakery pickup, while pantries may receive more than one delivery.</p></div>
            <div><strong>What remains soft</strong><p>Requested time and ZIP areas influence utility and modeled acceptance. A route may fall outside them and still be recommended when it is feasible and comparatively strong.</p></div>
          </div>
          <ul><li>Mixed-integer assignment and routing</li><li>Time-window and service-mode feasibility</li><li>Pantry priority based on recent receiving opportunities</li><li>Traffic-aware route estimates</li><li>Driver route-request matching</li></ul>
          <a className="modelGithub" href="https://github.com/vapeyproductions/bakedboston-optimizer" target="_blank" rel="noreferrer">Explore the optimization model on GitHub ↗</a>
        </div>
        <div className="demoSection" id="live-demo">
          <div className="demoIntro">
            <span className="kicker light">LIVE MATCH WALKTHROUGH</span>
            <h3>See a delivery get matched in five steps.</h3>
            <p>{demoData.liveRouteContext} Step 1 captures the decision epoch and driver preferences. Step 2 removes routes that violate hard timing constraints. Step 3 calculates the exact unscaled route utility. Step 4 maximizes pickup coverage before system utility, and Step 5 turns the joint solution into a conflict-free recommendation menu.</p>
          </div>
          <div className="demoStepTabs" role="tablist" aria-label="Optimization demo steps">
            {demoSteps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                className={index === demoStepIndex ? "active" : ""}
                aria-pressed={index === demoStepIndex}
                onClick={() => setDemoStepIndex(index)}
              >
                {step.label}
              </button>
            ))}
          </div>
          <div className="demoBoard">
            <div className="demoMapColumn">
              <div className="demoMap">
                <div className="demoMapHeader">
                  <span>Boston delivery network</span>
                  <small>{demoData.liveRouteLabel}</small>
                </div>
                <div className="demoMapCanvas">
                  <div className="demoWater" />
                  <div className="demoPark" />
                  <div className="demoRequestArea demoRequestAreaStart" style={{ left: demoData.request.startLeft, top: demoData.request.startTop }}>
                    <span>{demoData.request.startLabel}<small>ZIP {demoData.request.startZipCode} · {demoData.request.startRadiusMiles} mi requested area</small></span>
                  </div>
                  <div className="demoRequestArea demoRequestAreaDestination" style={{ left: demoData.request.destinationLeft, top: demoData.request.destinationTop }}>
                    <span>{demoData.request.destinationLabel}<small>ZIP {demoData.request.destinationZipCode} · {demoData.request.destinationRadiusMiles} mi requested area</small></span>
                  </div>
                  <svg className="demoRoutesSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {demoData.candidates.filter((route) => activeRoutes.includes(route.id)).map((route) => {
                      const isChosen = ["assignment", "recommendations"].includes(activeDemoStep.id) && chosenRouteId === route.id;
                      const geometry = getDemoRouteGeometry(route);
                      return (
                        <path
                          key={route.id}
                          d={geometry.path}
                          vectorEffect="non-scaling-stroke"
                          className={`${isChosen ? "chosen" : `candidate candidate${route.label}`} ${["assignment", "recommendations"].includes(activeDemoStep.id) && !isChosen ? "isDimmed" : ""}`}
                        />
                      );
                    })}
                    {(["utility", "assignment", "recommendations"].includes(activeDemoStep.id)
                      ? demoData.candidates.filter((route) => activeRoutes.includes(route.id))
                      : []
                    ).flatMap((route) => getSpatialDeviationLines(route, demoData.request).map((line) => (
                      <line
                        key={`${route.id}-${line.id}-deviation`}
                        x1={line.from.x}
                        y1={line.from.y}
                        x2={line.to.x}
                        y2={line.to.y}
                        vectorEffect="non-scaling-stroke"
                        className={`demoSpatialDeviationLine demoSpatialDeviationLine${route.label}`}
                      >
                        <title>{`Route ${route.label}: ${line.label}`}</title>
                      </line>
                    )))}
                  </svg>
                  {demoData.candidates
                    .filter((route) => activeRoutes.includes(route.id))
                    .map((route) => {
                      const isChosen = ["assignment", "recommendations"].includes(activeDemoStep.id) && chosenRouteId === route.id;
                      const geometry = getDemoRouteGeometry(route);
                      return (
                        <div
                          key={`${route.id}-badge`}
                          className={`demoRouteBadge demoRouteBadge${route.label} ${isChosen ? "isChosen" : ""} ${["assignment", "recommendations"].includes(activeDemoStep.id) && !isChosen ? "isDimmed" : ""}`}
                          style={{ left: geometry.badgeLeft, top: geometry.badgeTop }}
                          aria-hidden="true"
                        >
                          {route.label}
                        </div>
                      );
                    })}
                  {demoData.nodes.map((node) => {
                    const revealLabelOnHover = node.type === "Bakery" || node.type === "Pantry";

                    return (
                      <div
                        key={node.id}
                        className={`demoNode demoNode${node.type} ${activeNodeIds.includes(node.id) ? "isActive" : ""} ${node.isClosed && activeDemoStep.id === "network" ? "isClosed" : ""} ${node.isClosed && activeDemoStep.id !== "network" ? "isHidden" : ""}`}
                        style={{ left: node.left, top: node.top }}
                        title={revealLabelOnHover ? node.label : undefined}
                      >
                        {revealLabelOnHover && node.postalCode && (
                          <span className="demoFacilityZipArea" aria-hidden="true">
                            <small>{node.postalCode}</small>
                          </span>
                        )}
                        <span className="demoNodePin">{node.short}</span>
                        <div className={`demoNodeLabel ${revealLabelOnHover ? "demoNodeLabelHover" : ""}`}>
                          <strong>{node.label}</strong>
                          <small>{node.type}{node.postalCode ? ` · ZIP ${node.postalCode}` : ""}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {activeDemoStep.id === "utility" && (
                <div className="demoRouteScorePanel">
                  <div className="demoRouteScoreHeader">
                    <span>Candidate routes · unscaled optimizer utility</span>
                    <small>Higher is better; negative values are allowed and are not probabilities.</small>
                  </div>
                  <div className="demoRouteScoreGrid">
                    {demoData.candidates.map((route) => {
                      const utility = getDemoRouteUtility(route);
                      return (
                        <div key={route.id} className={`demoRouteScoreItem demoRouteScoreItem${route.label}`}>
                          <div className="demoRouteScoreTop">
                            <b>Route {route.label}</b>
                            <strong>{utility.total.toFixed(1)}</strong>
                          </div>
                          <p>{route.bakery} → {route.pantry}</p>
                          <small className="demoRouteEquation">
                            +{utility.priorityPoints.toFixed(1)} priority − {utility.drivePenalty.toFixed(1)} driving − {utility.timePenalty.toFixed(1)} time-window miss − {utility.spatialPenalty.toFixed(1)} location miss
                          </small>
                          <small className="demoRouteOperational">
                            Depart {route.departureLabel} · {route.driveMinutes.toFixed(0)} drive min · {(route.requestedTimeDeviationRatio * 100).toFixed(0)}% outside requested time · {(route.normalizedSpatialDeviation * 100).toFixed(0)}% normalized spatial deviation
                          </small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="demoSidebar">
              <div className="demoStepCard">
                <small>{activeDemoStep.label}</small>
                <h4>{activeDemoStep.title}</h4>
                <p>{activeDemoStep.description}</p>
                <div className="demoRequestSummary">
                  <span>Driver request</span>
                  <strong>{demoData.request.preferredStartLabel}–{demoData.request.preferredFinishLabel}</strong>
                  <small>Logged in {demoData.request.loginLabel} · {demoData.request.requestedWindowMinutes} minute interval</small>
                  <small>ZIP {demoData.request.startZipCode} start area → ZIP {demoData.request.destinationZipCode} destination area</small>
                </div>
                <div className="demoNetworkFunnel" aria-label="optimization network counts">
                  <span>Optimization funnel</span>
                  <div className="demoNetworkCounts">
                    <div className={`demoNetworkCount ${activeFunnelMetric === "network" ? "isCurrent" : ""}`}>
                      <strong>{networkNodeCount}</strong>
                      <small>Network nodes</small>
                    </div>
                    <div className={`demoNetworkCount ${activeFunnelMetric === "eligible" ? "isCurrent" : ""}`}>
                      <strong>{activeDemoStep.id === "network" ? networkNodeCount : eligibleNodeCount}</strong>
                      <small>Eligible nodes</small>
                    </div>
                    <div className={`demoNetworkCount ${activeFunnelMetric === "scored" ? "isCurrent" : ""}`}>
                      <strong>{scoredRouteCount}</strong>
                      <small>Routes scored</small>
                    </div>
                    <div className={`demoNetworkCount ${activeFunnelMetric === "selected" ? "isCurrent" : ""}`}>
                      <strong>{selectedRouteCount}</strong>
                      <small>Route selected</small>
                    </div>
                  </div>
                </div>
              </div>
              <div className="demoMipCard">
                <small>{activeDemoStep.mipTitle}</small>
                <p>{activeDemoStep.mipBody}</p>
                <div className="demoMipEquation">{activeDemoStep.mipEquation}</div>
                <ul>
                  {activeDemoStep.mipLines.map((line) => <li key={line}>{line}</li>)}
                </ul>
                <div className="demoMipMatrix" aria-label="assignment matrix preview">
                  {demoData.candidates.map((route) => {
                    const active = ["assignment", "recommendations"].includes(activeDemoStep.id) && route.id === chosenRouteId;
                    const eliminated = activeDemoStep.id === "feasibility" && route.id !== chosenRouteId;
                    return (
                      <div key={route.id} className={`demoMipMatrixRow ${active ? "isActive" : ""} ${eliminated ? "isDim" : ""}`}>
                        <span>{route.label}</span>
                        <b>{active ? "1" : "0"}</b>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="brand"><span className="brandMark">B</span><span>BakedBoston</span></div>
        <p>Built for neighbors. Optimized for impact.</p>
        <span>ORION GLOBAL HACKATHON 2026</span>
      </footer>
    </main>
  );
}
