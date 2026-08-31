"use client";

import { useEffect, useState } from "react";

const APP_STORE_URL = "https://apps.apple.com/us/app/bakedboston/id6795673575";
const APP_STORE_QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(APP_STORE_URL)}`;

type DemoStep = {
  id: string;
  label: string;
  title: string;
  description: string;
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

type DemoRoute = {
  id: string;
  label: string;
  symbol: string;
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

type DemoDataset = {
  status: "ready" | "unavailable";
  nodes: DemoNode[];
  candidates: DemoRoute[];
  highlightedRouteId: string | null;
  liveRouteLabel: string;
  liveRouteContext: string;
  databaseSnapshot: {
    bakeriesConsidered: number;
    pantriesConsidered: number;
    generatedCombinations: number;
    rejectedCombinations: number;
    feasibleCandidates: number;
  };
  filterAudit: DemoFilterAuditEntry[];
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

const demoPercent = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`;

const demoObjectiveParts: Array<{ key: keyof DemoObjectiveComponents; short: string; weight: number }> = [
  { key: "pantryCoverage", short: "κ", weight: 10 },
  { key: "rawFoodVolume", short: "νʳᵃʷ", weight: 10 },
  { key: "rawFoodEvenness", short: "εʳᵃʷ", weight: 10 },
  { key: "savedFoodVolume", short: "νˢᵃᵛᵉᵈ", weight: 10 },
  { key: "savedFoodEvenness", short: "εˢᵃᵛᵉᵈ", weight: 10 },
  { key: "pantryPriority", short: "ρ", weight: 10 },
  { key: "environmentalBenefit", short: "γ", weight: 20 },
  { key: "driverFit", short: "χ", weight: 20 },
];

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
    id: "snapshot",
    label: "1 · Database snapshot",
    title: "The model reads the eligible partner network.",
    description: "The walkthrough begins with registered, active, address-validated bakeries and pantries from the application database. It does not invent or register organizations.",
    mipTitle: "Read-only operational state",
    mipBody: "Names, coordinates, ZIP codes, and partner status come from the live database. The driver request and food realization below are synthetic demonstration events.",
    mipLines: ["registered partner account required", "active organization required", "validated coordinates required", "no account, route, or notification is written"],
    mipEquation: "B, P ← current eligible database records",
  },
  {
    id: "request",
    label: "2 · Driver request",
    title: "A driver request joins a rolling decision epoch.",
    description: "The driver supplies a preferred interval and soft start/destination areas. Login is when the model receives the request—not when the driver must depart. Production solves all requests entering the same epoch together; this trace isolates one driver for readability.",
    mipTitle: "Synthetic driver input",
    mipBody: "The demo creates one read-only request around the database network so the route-generation and selection logic can be inspected without creating a production offer.",
    mipLines: ["simultaneous production requests are optimized jointly", "requested interval is at least 30 minutes", "start and destination radii are soft preferences", "a later just-in-time departure may be scheduled", "the outer search horizon remains a hard limit"],
    mipEquation: "d = (login, preferred interval, origin area, destination area)",
  },
  {
    id: "feasibility",
    label: "3 · Candidate columns",
    title: "The model shows what survives—and what does not.",
    description: "Every driver–bakery–pantry combination is checked against the fixed bakery and pantry schedules plus the driver's hard search horizon. The audit below identifies each rejected pair and the first hard rule it fails; only the retained columns proceed to impact scoring.",
    mipTitle: "Timed route construction",
    mipBody: "Each surviving binary route column carries its own departure, pickup, pantry arrival, and finish. Rejected combinations never enter the objective, no matter how much food they might recover. Five minutes are reserved at each facility.",
    mipLines: ["departure cannot precede login", "pickup must meet the bakery deadline", "pantry arrival must meet the latest arrival", "the complete trip must fit the hard search horizon", "one best timed column is retained per driver–bakery–pantry combination"],
    mipEquation: "r = (d,b,p,tᵈᵉᵖ,tᵖⁱᶜᵏ,tᵃʳʳ,tᶠⁱⁿ); r ∈ R only when hard constraints hold",
  },
  {
    id: "accounting",
    label: "4 · Food + CO₂e",
    title: "Each feasible route gets the same food and direct-CO₂e ledger.",
    description: "For the selected database partners, the demo applies one synthetic daily food realization. The model compares the bakery's no-pickup waste outcome with collected-but-undistributed route waste, then subtracts tonne-kilometre transportation emissions.",
    mipTitle: "Route environmental coefficient",
    mipBody: "The route is credited only for food ultimately distributed. Food that is picked up but not distributed remains in the route-waste outcome.",
    mipLines: ["qᵣ is the synthetic daily bakery donation", "ηᵦ is the bakery usability fraction", "δₚ is the pantry distribution fraction", "uncollected bakery food is qᵣ when no route is selected", "collected-but-undistributed food is qᵣ − hᵣ after selection", "primary avoided-production substitution remains 0%"],
    mipEquation: "hᵣ = qᵣ · ηᵦ · δₚ; γᵣ = avoided waste CO₂e − transport CO₂e",
  },
  {
    id: "participation",
    label: "5 · Acceptance estimate",
    title: "Estimate completion likelihood—without creating a veto.",
    description: "The model converts route burden into a transparent synthetic acceptance estimate. This probability scales the route's broader impact; it is not optimized first and does not impose a 99%-of-best cutoff.",
    mipTitle: "Modeled completion likelihood",
    mipBody: "Driving time plus normalized time-window and spatial misses reduce the estimate. A burdensome option receives less expected-impact credit, while a slightly lower probability can still win when its food, fairness, or environmental value is stronger.",
    mipLines: ["drive minutes enter directly", "requested-time miss is divided by requested-window length", "start/destination misses are normalized among alternatives", "estimated probabilities are clipped to 2%–98%"],
    mipEquation: "πᵣ = σ(2.2 − .045mᵣ − 1.8wᵣ − 1.1sᵣ)",
  },
  {
    id: "objective",
    label: "6 · Expected impact",
    title: "Balance participation and real-world value in one score.",
    description: "The one-driver trace multiplies each route's normalized completed-impact score by its modeled acceptance probability. Every component is bounded to [0,1] before its policy weight is applied.",
    mipTitle: "Acceptance-adjusted impact objective",
    mipBody: "The trace evaluates the same eight components used by a simultaneous network solve, including cumulative pantry food balance, and then scales that completed-route value by modeled acceptance.",
    mipLines: ["10 pantry coverage + 10 raw-food volume + 10 raw-food evenness", "10 saved-food volume + 10 saved-food evenness + 10 pantry priority", "20 normalized direct environmental benefit", "20 normalized driver fit"],
    mipEquation: "r★ = arg max { πᵣ · (ωᵀφᵣ) | r ∈ ℛ(d) }",
  },
  {
    id: "selection",
    label: "7 · Route selected",
    title: "The binary solution becomes a timed, conflict-free recommendation.",
    description: "The selected route has the greatest acceptance-adjusted expected impact among feasible alternatives. Accepted assignments consume their bakery pickup; a rejection or timeout leaves it available for a later rolling solve.",
    mipTitle: "Assignment constraints",
    mipBody: "The full network model coordinates all simultaneous drivers. When choices are shown, menus are built one rank at a time so every driver gets a first conflict-free option before anyone gets a second. This trace holds the driver count at one so every candidate remains readable.",
    mipLines: ["at most one route per driver request", "at most one route per physical driver", "at most one assignment per bakery pickup", "open pantry windows may receive multiple deliveries"],
    mipEquation: "xᵣ ∈ {0,1}; selected route has xᵣ = 1",
  },
];

const fallbackDemoData: DemoDataset = {
  status: "unavailable",
  nodes: [],
  candidates: [],
  highlightedRouteId: null,
  liveRouteLabel: "Waiting for the live partner feed",
  liveRouteContext: "The walkthrough requires the current registered and validated partner network.",
  databaseSnapshot: { bakeriesConsidered: 0, pantriesConsidered: 0, generatedCombinations: 0, rejectedCombinations: 0, feasibleCandidates: 0 },
  filterAudit: [],
  request: {
    loginLabel: "—",
    preferredStartLabel: "—",
    preferredFinishLabel: "—",
    searchUntilLabel: "—",
    requestedWindowMinutes: 30,
    startLabel: "Requested start area",
    startZipCode: "—",
    startRadiusMiles: 2,
    startLeft: "40%",
    startTop: "60%",
    destinationLabel: "Requested destination area",
    destinationZipCode: "—",
    destinationRadiusMiles: 2,
    destinationLeft: "72%",
    destinationTop: "42%",
  },
};

export default function Home() {
  const [network, setNetwork] = useState({ bakeries: 0, pantries: 0, drivers: 0, completedThisWeek: 0, completedTotal: 0, averagePantriesHelpedPerDay: 0 });
  const [demoStepIndex, setDemoStepIndex] = useState(0);
  const [demoData, setDemoData] = useState<DemoDataset>(fallbackDemoData);
  const [demoStatus, setDemoStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const scrollToModel = () => document.getElementById("model")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const scrollToDemo = () => document.getElementById("live-demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const activeDemoStep = demoSteps[demoStepIndex];
  const chosenRouteId = demoData.highlightedRouteId ?? demoData.candidates[0]?.id ?? null;
  const activeNodeIds = demoData.nodes.map((node) => node.id);
  const activeRoutes = ["snapshot", "request"].includes(activeDemoStep.id)
    ? []
    : demoData.candidates.map((route) => route.id);
  const networkNodeCount = demoData.databaseSnapshot.bakeriesConsidered + demoData.databaseSnapshot.pantriesConsidered;
  const generatedCombinationCount = demoData.databaseSnapshot.generatedCombinations;
  const rejectedCombinationCount = demoData.databaseSnapshot.rejectedCombinations;
  const feasibleRouteCount = demoData.databaseSnapshot.feasibleCandidates;
  const selectedRouteCount = activeDemoStep.id === "selection" && chosenRouteId ? 1 : 0;
  const activeFunnelMetric = activeDemoStep.id === "snapshot"
    ? "network"
    : activeDemoStep.id === "request"
      ? "generated"
      : activeDemoStep.id === "selection"
        ? "selected"
        : "feasible";

  useEffect(() => {
    void fetch("/api/public/stats", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (data) setNetwork(data); });
    void fetch("/api/public/demo-network", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Partner feed unavailable")))
      .then((data: DemoDataset) => {
        if (data.status === "ready" && data.nodes.length && data.candidates.length) {
          setDemoData(data);
          setDemoStatus("ready");
          return;
        }
        setDemoStatus("unavailable");
      })
      .catch(() => setDemoStatus("unavailable"));
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
          <div><span>02</span><div className="stepIcon">✦</div><h3>We optimize the match</h3><p>The MIP enforces complete route timing, protects expected completed pickups, then balances pantry reach and priority, raw and distributed food, equity, direct CO₂e benefit, and driver fit.</p></div>
          <div><span>03</span><div className="stepIcon">🚙</div><h3>Neighbors drive the loop</h3><p>Volunteers claim a route and deliver food while it’s still fresh.</p></div>
        </div>
      </section>

      <section className="modelSection" id="model">
        <div>
          <span className="kicker light">THE OPERATIONS RESEARCH</span>
          <h2>Less waste is<br />a solvable problem.</h2>
        </div>
        <div className="modelCopy">
          <p>At each rolling decision epoch, BakedBoston uses a Gurobi mixed-integer model to choose jointly among complete, feasible driver–bakery–pantry plans. Each route column includes a just-in-time departure, five minutes to load at the bakery, the trip to the pantry, and five minutes to unload. The formulation is a research-informed academic prototype: operational constraints are explicit, while volunteer acceptance remains a transparent synthetic assumption until real participation data exists.</p>
          <div className="modelObjective">
            <div className="modelObjectiveStage">
              <small>Simultaneous network objective</small>
              <strong>maximize <b>Φ(x) = ωᵀψ(x; π)</b>, &nbsp;x ∈ 𝒳</strong>
              <p>The feasible assignment x maximizes one acceptance-adjusted network feature vector ψ: pantry reach, raw and ultimately distributed food, evenness, opportunity priority, direct environmental benefit, and driver fit.</p>
            </div>
            <div className="modelObjectiveStage">
              <small>One-driver route choice</small>
              <strong><b>r★ = arg max &#123; πᵣ · (ωᵀφᵣ) | r ∈ ℛ(d) &#125;</b></strong>
              <p>Among driver d&apos;s feasible routes ℛ(d), choose the route with the largest completion likelihood πᵣ times completed-impact value ωᵀφᵣ. There is no separate participation stage or 99%-of-best cutoff.</p>
            </div>
            <div className="modelObjectiveWhy">
              <strong>Why combine them?</strong>
              <p>A route that is unlikely to happen earns less expected-impact credit, but a small difference in a synthetic probability cannot automatically veto a route that rescues substantially more food or produces a fairer, cleaner result.</p>
            </div>
            <div className="modelRouteUtility">
              <small>Completion likelihood</small>
              <strong>πᵣ = σ(2.2 − 0.045mᵣ − 1.8wᵣ − 1.1sᵣ)</strong>
              <p>mᵣ is drive time; wᵣ and sᵣ are normalized requested-time and requested-area misses. This is an auditable scenario assumption—not a trained behavioral model.</p>
            </div>
            <div className="modelRouteUtility">
              <small>Food and direct environmental accounting</small>
              <strong>hᵣ = qᵣ · ηᵦ · δₚ;&nbsp; γᵣ = avoided waste CO₂e − transport CO₂e</strong>
              <p>Food that is collected but not ultimately distributed remains in route waste. Avoided-production substitution is fixed at zero in the primary objective.</p>
            </div>
          </div>
          <p className="modelFactorIntro"><b>ω = (10, 10, 10, 10, 10, 10, 20, 20)ᵀ</b>. Every component in φᵣ is normalized to [0,1] before the policy weight is applied, and route contributions are adjusted by πᵣ. Hard feasibility is enforced first, so an attractive score can never override a closed window or missed deadline.</p>
          <div className="modelFactorGrid">
            <div className="modelFactor"><strong>xᵣ · assignment</strong><p>A binary variable: 1 when complete timed route r is selected, otherwise 0.</p></div>
            <div className="modelFactor"><strong>πᵣ · completion likelihood</strong><p>A synthetic probability based on driving burden and driver time/location fit. It scales impact instead of serving as a hard preliminary objective.</p></div>
            <div className="modelFactor"><strong>κᵣ · pantry coverage · 10</strong><p>Modeled completion credit for available unique pantry identities, capped once per pantry.</p></div>
            <div className="modelFactor"><strong>νᵣʳᵃʷ + εᵣʳᵃʷ · raw food · 10 + 10</strong><p>Acceptance-weighted raw bakery-food volume plus evenness calculated from cumulative expected raw donations.</p></div>
            <div className="modelFactor"><strong>νᵣˢᵃᵛᵉᵈ + εᵣˢᵃᵛᵉᵈ · saved food · 10 + 10</strong><p>Acceptance-weighted ultimately distributed food, where hᵣ = qᵣ · ηᵦ · δₚ, plus cumulative expected saved-food evenness.</p></div>
            <div className="modelFactor"><strong>ρᵣ · opportunity priority · 10</strong><p>A pantry available but less often served receives more acceptance-adjusted credit through its smoothed recent-opportunity history.</p></div>
            <div className="modelFactor"><strong>γᵣ · direct environmental benefit · 20</strong><p>The acceptance-weighted bakery no-pickup waste result minus collected-but-undistributed route waste and tonne-kilometre transportation emissions, min–max normalized across candidates.</p></div>
            <div className="modelFactor"><strong>χᵣ · driver fit · 20</strong><p>Acceptance-weighted fit: one minus the mean normalized drive-time, requested-window, and requested-area burdens.</p></div>
          </div>
          <div className="modelDetails">
            <div><strong>Planned departure</strong><p>Login time is the decision epoch, not a forced departure. The model schedules the latest feasible departure, so planned lead time at the origin is not penalized.</p></div>
            <div><strong>Hard constraints</strong><p>Confirmed partner windows, bakery pickup deadlines, pantry latest arrivals, full travel and service timing, at most one route per driver request, and at most one assignment per bakery pickup.</p></div>
            <div><strong>Simultaneous network solve</strong><p>All requests entering the same decision epoch are optimized jointly. Each request, physical driver, and bakery pickup can appear in at most one selected assignment; an open pantry may receive multiple deliveries.</p></div>
            <div><strong>Layered route menus</strong><p>Conflict-free options are allocated by rank: maximize how many drivers receive recommendation #1 before allocating recommendation #2, then optimize route utility within each layer.</p></div>
            <div><strong>What remains soft</strong><p>Requested time and ZIP areas influence utility and modeled acceptance. A route may fall outside them and still be recommended when it is feasible and comparatively strong.</p></div>
          </div>
          <div className="modelResearch">
            <span className="kicker light">RESEARCH FOUNDATION</span>
            <p>The formulation adapts established problem families rather than claiming a new one from scratch. The exact BakedBoston weights, simulated schedules, and acceptance coefficients are original prototype choices and are not estimates reported by these papers.</p>
            <div className="modelResearchGrid">
              <a href="https://doi.org/10.1016/j.seps.2017.06.003" target="_blank" rel="noreferrer"><strong>Food-rescue scheduling ↗</strong><span>Nair et al. model donor–agency allocation and routing with perishability and time constraints.</span></a>
              <a href="https://doi.org/10.1016/j.tre.2018.02.001" target="_blank" rel="noreferrer"><strong>Equity in food rescue ↗</strong><span>Rey, Almi’ani, and Nair show why routing efficiency and fair agency service must be considered together.</span></a>
              <a href="https://doi.org/10.1016/j.tre.2021.102419" target="_blank" rel="noreferrer"><strong>Volunteer route menus ↗</strong><span>Horner, Pazour, and Mitchell optimize menu-style assignments for occasional drivers rather than assuming a fixed fleet.</span></a>
              <a href="https://doi.org/10.1016/j.trb.2011.07.010" target="_blank" rel="noreferrer"><strong>Sustainable routing ↗</strong><span>The pollution-routing literature motivates including distance and environmental consequences alongside service performance.</span></a>
              <a href="https://doi.org/10.3390/foods15040645" target="_blank" rel="noreferrer"><strong>Food-redistribution lifecycle assessment ↗</strong><span>Guo et al. assess global warming, acidification, eutrophication, energy demand, and water use. Their results motivate the model’s food-quality, redistribution-loss, disposal-pathway, and transport accounting. The primary score conservatively sets avoided-production substitution to zero.</span></a>
            </div>
          </div>
          <ul><li>Rolling-horizon joint decision epochs</li><li>Complete timed route-column generation</li><li>Hard pickup, receiving, and service feasibility</li><li>One acceptance-adjusted expected-impact objective</li><li>Opportunity-based pantry priority and cumulative food equity</li><li>Direct waste-pathway and transport CO₂e accounting</li><li>Conflict-free, coverage-first driver route menus</li><li>Soft requested-time and ZIP-area matching</li></ul>
          <a className="modelGithub" href="https://github.com/vapeyproductions/bakedboston-optimizer" target="_blank" rel="noreferrer">Explore the optimization model on GitHub ↗</a>
        </div>
        <div className="demoSection" id="live-demo">
          <div className="demoIntro">
            <span className="kicker light">DATABASE-BACKED ONE-DRIVER MODEL TRACE</span>
            <h3>Follow the current routing logic in seven auditable steps.</h3>
            <p>{demoData.liveRouteContext} Partner identities and coordinates come from the live database; the driver request, food realization, and decision epoch are synthetic and read-only. This explanatory trace applies the current route accounting and acceptance-adjusted expected-impact selection without creating an offer; the production service solves simultaneous requests jointly with Gurobi.</p>
          </div>
          {demoStatus !== "ready" ? (
            <div className="demoUnavailable" role="status">
              <span>{demoStatus === "loading" ? "CONNECTING TO PARTNER DATABASE" : "LIVE PARTNER FEED UNAVAILABLE"}</span>
              <h4>{demoStatus === "loading" ? "Loading the current bakery and pantry network…" : "The model trace will return when the database is available."}</h4>
              <p>No fictional organizations are substituted. The current Neon database quota must be restored before this database-backed demonstration can populate.</p>
            </div>
          ) : (<>
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
                    <span><strong>{demoData.request.startLabel}</strong><small>ZIP {demoData.request.startZipCode} · {demoData.request.startRadiusMiles} mi radius</small></span>
                  </div>
                  <div className="demoRequestArea demoRequestAreaDestination" style={{ left: demoData.request.destinationLeft, top: demoData.request.destinationTop }}>
                    <span><strong>{demoData.request.destinationLabel}</strong><small>ZIP {demoData.request.destinationZipCode} · {demoData.request.destinationRadiusMiles} mi radius</small></span>
                  </div>
                  <svg className="demoRoutesSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {demoData.candidates.filter((route) => activeRoutes.includes(route.id)).map((route) => {
                      const isChosen = activeDemoStep.id === "selection" && chosenRouteId === route.id;
                      const geometry = getDemoRouteGeometry(route);
                      return (
                        <path
                          key={route.id}
                          d={geometry.path}
                          vectorEffect="non-scaling-stroke"
                          className={`${isChosen ? "chosen" : `candidate candidate${route.label}`} ${activeDemoStep.id === "selection" && !isChosen ? "isDimmed" : ""}`}
                        />
                      );
                    })}
                    {(["participation", "objective", "selection"].includes(activeDemoStep.id)
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
                        <title>{`Route ${route.symbol}: ${line.label}`}</title>
                      </line>
                    )))}
                  </svg>
                  {demoData.candidates
                    .filter((route) => activeRoutes.includes(route.id))
                    .map((route) => {
                      const isChosen = activeDemoStep.id === "selection" && chosenRouteId === route.id;
                      const geometry = getDemoRouteGeometry(route);
                      return (
                        <div
                          key={`${route.id}-badge`}
                          className={`demoRouteBadge demoRouteBadge${route.label} ${isChosen ? "isChosen" : ""} ${activeDemoStep.id === "selection" && !isChosen ? "isDimmed" : ""}`}
                          style={{ left: geometry.badgeLeft, top: geometry.badgeTop }}
                          aria-hidden="true"
                        >
                          {route.symbol}
                        </div>
                      );
                    })}
                  {demoData.nodes.map((node) => {
                    const revealLabelOnHover = node.type === "Bakery" || node.type === "Pantry";

                    return (
                      <div
                        key={node.id}
                        className={`demoNode demoNode${node.type} ${activeNodeIds.includes(node.id) ? "isActive" : ""}`}
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
                          <small>{node.type}{node.postalCode ? ` · ZIP ${node.postalCode}` : ""}{node.eligibilityLabel ? ` · ${node.eligibilityLabel}` : ""}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {activeDemoStep.id === "feasibility" && (
                <div className="demoFilterAudit">
                  <div className="demoFilterAuditHeader">
                    <div>
                      <span>Hard-constraint filter audit</span>
                      <strong>{generatedCombinationCount} generated pairs → {rejectedCombinationCount} rejected + {feasibleRouteCount} feasible</strong>
                    </div>
                    <small>Rejections happen before expected-impact scoring.</small>
                  </div>
                  <div className="demoFilterAuditGrid">
                    {demoData.filterAudit.map((entry) => (
                      <div key={entry.id} className={`demoFilterAuditRow ${entry.status === "feasible" ? "isFeasible" : "isRejected"}`}>
                        <span className="demoFilterStatus" aria-hidden="true">{entry.status === "feasible" ? "✓" : "×"}</span>
                        <div>
                          <b>{entry.bakery} → {entry.pantry}</b>
                          <strong>{entry.reasonLabel}</strong>
                          <small>{entry.detail}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {["accounting", "participation", "objective", "selection"].includes(activeDemoStep.id) && (
                <div className="demoRouteScorePanel">
                  <div className="demoRouteScoreHeader">
                    <span>{activeDemoStep.id === "accounting" ? "Candidate food and environmental outcomes" : activeDemoStep.id === "participation" ? "Modeled completion likelihood" : activeDemoStep.id === "objective" ? "Acceptance-adjusted expected impact" : "Selected timed recommendation"}</span>
                    <small>{activeDemoStep.id === "selection" ? "The selected route has the greatest expected impact—without a 99% participation filter." : "The same feasible route columns contribute to one combined objective."}</small>
                  </div>
                  <div className="demoRouteScoreGrid">
                    {demoData.candidates.map((route) => (
                        <div key={route.id} className={`demoRouteScoreItem demoRouteScoreItem${route.label} ${activeDemoStep.id === "selection" && route.id === chosenRouteId ? "isSelected" : ""}`}>
                          <div className="demoRouteScoreTop">
                            <b>Route {route.symbol}</b>
                            <strong>{activeDemoStep.id === "accounting" ? `${route.foodSavedKg.toFixed(1)} kg` : activeDemoStep.id === "participation" ? demoPercent(route.acceptanceProbability, 1) : route.expectedImpactValue.toFixed(1)}</strong>
                          </div>
                          <p>{route.bakery} → {route.pantry}</p>
                          {activeDemoStep.id === "accounting" && <>
                            <small className="demoRouteEquation">hᵣ = {route.rawFoodKg.toFixed(1)} kg × {demoPercent(route.usableFraction, 1)} × {demoPercent(route.pantryDistributionFraction, 1)} = {route.foodSavedKg.toFixed(1)} kg ultimately distributed</small>
                            <small className="demoRouteOperational">No pickup: {route.uncollectedFoodKg.toFixed(1)} kg bakery waste · completed route remainder: {route.collectedNotDistributedKg.toFixed(1)} kg · waste-pathway change: {(route.counterfactualWasteKgCO2e - route.routeWasteKgCO2e).toFixed(2)} kg CO₂e · transport: {route.transportKgCO2e.toFixed(2)} kg CO₂e · net: {route.netEnvironmentalBenefitKgCO2e.toFixed(2)} kg CO₂e</small>
                          </>}
                          {activeDemoStep.id === "participation" && <>
                            <small className="demoRouteEquation">πᵣ = {demoPercent(route.acceptanceProbability, 1)} modeled completion likelihood</small>
                            <small className="demoRouteOperational">{route.driveMinutes.toFixed(0)} drive min · {demoPercent(route.requestedTimeDeviationRatio)} requested-time miss · {demoPercent(route.normalizedSpatialDeviation)} normalized location miss · driver fit {demoPercent(route.driverFit, 1)}</small>
                          </>}
                          {activeDemoStep.id === "objective" && <>
                            <small className="demoRouteEquation">{demoPercent(route.acceptanceProbability, 1)} × {route.completedImpactValue.toFixed(1)} completed-impact points = {route.expectedImpactValue.toFixed(1)} expected-impact points</small>
                            <div className="demoObjectiveBreakdown">
                              {demoObjectiveParts.map((part) => <span key={part.key}><b>{part.short}</b>{(route.acceptanceProbability * route.objectiveComponents[part.key] * part.weight).toFixed(1)} expected</span>)}
                            </div>
                          </>}
                          {activeDemoStep.id === "selection" && <>
                            <small className="demoRouteEquation">{route.id === chosenRouteId ? "xᵣ = 1 · selected" : "xᵣ = 0 · not selected"} · expected impact {route.expectedImpactValue.toFixed(1)} = {demoPercent(route.acceptanceProbability, 1)} × {route.completedImpactValue.toFixed(1)}</small>
                            <small className="demoRouteOperational">Depart {route.departureLabel} → pickup {route.pickupLabel} → pantry {route.arrivalLabel} → finish {route.finishLabel}</small>
                          </>}
                          <small className="demoRouteOperational">
                            {route.distanceMiles.toFixed(1)} route mi · pantry priority {demoPercent(route.priority, 1)} · depart {route.departureLabel}
                          </small>
                        </div>
                    ))}
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
                  <small>Hard route-completion horizon: {demoData.request.searchUntilLabel}</small>
                  <small>ZIP {demoData.request.startZipCode} start area → ZIP {demoData.request.destinationZipCode} destination area</small>
                </div>
                <div className="demoNetworkFunnel" aria-label="optimization network counts">
                  <span>Optimization funnel</span>
                  <div className="demoNetworkCounts">
                    <div className={`demoNetworkCount ${activeFunnelMetric === "network" ? "isCurrent" : ""}`}>
                      <strong>{networkNodeCount}</strong>
                      <small>Database partners</small>
                    </div>
                    <div className={`demoNetworkCount ${activeFunnelMetric === "generated" ? "isCurrent" : ""}`}>
                      <strong>{generatedCombinationCount}</strong>
                      <small>Generated pairs</small>
                    </div>
                    <div className={`demoNetworkCount demoNetworkCountRejected ${activeDemoStep.id === "feasibility" ? "isCurrent" : ""}`}>
                      <strong>{rejectedCombinationCount}</strong>
                      <small>Hard-rule rejections</small>
                    </div>
                    <div className={`demoNetworkCount ${activeFunnelMetric === "feasible" ? "isCurrent" : ""}`}>
                      <strong>{feasibleRouteCount}</strong>
                      <small>Feasible columns</small>
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
                    const active = activeDemoStep.id === "selection" && route.id === chosenRouteId;
                    const eliminated = activeDemoStep.id === "selection" && route.id !== chosenRouteId;
                    return (
                      <div key={route.id} className={`demoMipMatrixRow ${active ? "isActive" : ""} ${eliminated ? "isDim" : ""}`}>
                        <span>{route.symbol}</span>
                        <b>{active ? "1" : "0"}</b>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          </>)}
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
