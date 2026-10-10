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
  pantryResidualFoodKg: number;
  pantryLandfillFraction: number;
  pantryPigFarmFraction: number;
  pantryRouteWasteKgCO2e: number;
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
    label: "1 · Available partners",
    title: "Start with bakeries and pantries that are ready to participate.",
    description: "The demo uses the current eligible partner network. It is read-only and never creates a route or sends a notification.",
    mipTitle: "Partner check",
    mipBody: "The system starts with active bakeries and pantries that have confirmed location information.",
    mipLines: ["active partner accounts", "confirmed location details", "no changes are made by this demo"],
  },
  {
    id: "request",
    label: "2 · Driver request",
    title: "A volunteer shares when and where they can help.",
    description: "The request includes a preferred time and travel area. This walkthrough follows one request so the recommendation is easy to see.",
    mipTitle: "Volunteer preferences",
    mipBody: "The system considers the driver’s requested time and travel area when looking for a good match.",
    mipLines: ["preferred time", "starting area", "destination area"],
  },
  {
    id: "feasibility",
    label: "3 · Schedule check",
    title: "Keep only routes that can realistically happen.",
    description: "The system checks the driver’s availability, bakery pickup hours, pantry receiving hours, and travel time. Incompatible options are removed.",
    mipTitle: "Route check",
    mipBody: "Each option must fit the real operating schedules before it can be considered.",
    mipLines: ["pickup is during bakery hours", "delivery is during pantry hours", "the full trip fits the driver’s availability"],
  },
  {
    id: "accounting",
    label: "4 · Community impact",
    title: "Estimate what each route can save.",
    description: "Every feasible route is evaluated for food delivered, pantry capacity, travel, and environmental impact.",
    mipTitle: "Food and environmental impact",
    mipBody: "The model compares the benefit of recovering food with the impact of travel and any food that cannot be distributed.",
    mipLines: ["food delivered to the pantry", "food expected to reach community members", "waste and travel impact"],
  },
  {
    id: "participation",
    label: "5 · Driver fit",
    title: "Favor routes a volunteer is more likely to complete.",
    description: "Shorter, better-timed routes that stay closer to a driver’s preferred area receive a stronger fit estimate.",
    mipTitle: "Volunteer practicality",
    mipBody: "Driver fit reflects travel time, schedule fit, and location fit.",
    mipLines: ["driving time", "schedule fit", "location fit"],
  },
  {
    id: "objective",
    label: "6 · Compare options",
    title: "Balance the benefits of every available route.",
    description: "The recommendation considers food recovery, fair pantry service, environmental impact, and driver fit together.",
    mipTitle: "Overall route impact",
    mipBody: "No single measure decides the outcome. The best route is the one that creates the strongest overall benefit.",
    mipLines: ["food recovery", "pantry coverage and fairness", "environmental impact", "driver fit"],
  },
  {
    id: "selection",
    label: "7 · Recommendation",
    title: "Offer the strongest practical route.",
    description: "The recommended route includes a bakery, pantry, and suggested schedule. If it is not accepted, food can be offered again while it is still available.",
    mipTitle: "Route ready",
    mipBody: "The system provides one clear pickup-and-delivery recommendation for the volunteer.",
    mipLines: ["one volunteer", "one bakery pickup", "one pantry delivery"],
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
          <div><span>02</span><div className="stepIcon">✦</div><h3>We find a good match</h3><p>We check schedules and compare food recovery, community need, environmental impact, and driver fit.</p></div>
          <div><span>03</span><div className="stepIcon">🚙</div><h3>Neighbors drive the loop</h3><p>Volunteers claim a route and deliver food while it’s still fresh.</p></div>
        </div>
      </section>

      <section className="modelSection" id="model">
        <div>
          <span className="kicker light">THE OPERATIONS RESEARCH</span>
          <h2>Less waste is<br />a solvable problem.</h2>
        </div>
        <div className="modelCopy">
          <p>BakedBoston is a research-informed routing tool for moving bakery surplus to local pantries while it can still be used. It finds routes that work in the real world, then recommends the option with the strongest overall community impact.</p>
          <div className="modelDetails">
            <div><strong>Available when needed</strong><p>Only bakeries, pantries, and volunteers with compatible schedules are considered.</p></div>
            <div><strong>Designed for impact</strong><p>Routes are compared by food recovery, pantry service, environmental impact, and driver practicality.</p></div>
            <div><strong>Built for the community</strong><p>Multiple volunteer requests can be coordinated so one pickup is not offered twice.</p></div>
          </div>
          <div className="modelResearch">
            <span className="kicker light">RESEARCH FOUNDATION</span>
            <p>BakedBoston draws on food-rescue, volunteer-routing, equity, and environmental research. Read the source studies for their methods and findings; the full BakedBoston technical paper will be linked here when it is complete.</p>
            <div className="modelResearchGrid">
              <a href="https://doi.org/10.1016/j.seps.2017.06.003" target="_blank" rel="noreferrer"><strong>Food-rescue scheduling ↗</strong><span>How donors, agencies, and delivery timing can be coordinated.</span></a>
              <a href="https://doi.org/10.1016/j.tre.2018.02.001" target="_blank" rel="noreferrer"><strong>Equity in food rescue ↗</strong><span>Why fair service across agencies matters alongside efficiency.</span></a>
              <a href="https://doi.org/10.1016/j.tre.2021.102419" target="_blank" rel="noreferrer"><strong>Volunteer route menus ↗</strong><span>How volunteer route options can be offered and coordinated.</span></a>
              <a href="https://doi.org/10.1016/j.clscn.2025.100253" target="_blank" rel="noreferrer"><strong>Environmental food-delivery routing ↗</strong><span>How food recovery, waste, and transport can be assessed together.</span></a>
              <a href="https://doi.org/10.3390/foods15040645" target="_blank" rel="noreferrer"><strong>Food-redistribution lifecycle assessment ↗</strong><span>Environmental considerations across donation and redistribution.</span></a>
            </div>
          </div>
          <a className="modelGithub" href="https://github.com/vapeyproductions/bakedboston-optimizer" target="_blank" rel="noreferrer">Read the research notes and source code on GitHub ↗</a>
        </div>
        <div className="demoSection" id="live-demo">
          <div className="demoIntro">
            <span className="kicker light">LIVE ROUTE WALKTHROUGH</span>
            <h3>See how BakedBoston finds one practical delivery.</h3>
            <p>{demoData.liveRouteContext} Partner identities and locations come from the live database. The example request and daily food estimate are illustrative, and this walkthrough never creates an offer.</p>
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
                      <span>Schedule check</span>
                      <strong>{generatedCombinationCount} options checked → {rejectedCombinationCount} unavailable + {feasibleRouteCount} available</strong>
                    </div>
                    <small>Every route must fit partner hours and driver availability.</small>
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
                    <span>{activeDemoStep.id === "accounting" ? "Food and environmental impact" : activeDemoStep.id === "participation" ? "Driver fit" : activeDemoStep.id === "objective" ? "Overall route impact" : "Recommended route"}</span>
                    <small>{activeDemoStep.id === "selection" ? "The recommendation is the best overall available match." : "Each available route is compared using the same information."}</small>
                  </div>
                  <div className="demoRouteScoreGrid">
                    {demoData.candidates.map((route) => (
                        <div key={route.id} className={`demoRouteScoreItem demoRouteScoreItem${route.label} ${activeDemoStep.id === "selection" && route.id === chosenRouteId ? "isSelected" : ""}`}>
                          <div className="demoRouteScoreTop">
                            <b>Route {route.symbol}</b>
                            <strong>{activeDemoStep.id === "accounting" ? `${route.foodSavedKg.toFixed(1)} kg` : activeDemoStep.id === "participation" ? demoPercent(route.acceptanceProbability, 1) : activeDemoStep.id === "selection" && route.id === chosenRouteId ? "Recommended" : route.expectedImpactValue.toFixed(1)}</strong>
                          </div>
                          <p>{route.bakery} → {route.pantry}</p>
                          {activeDemoStep.id === "accounting" && <>
                            <small className="demoRouteEquation">{route.foodSavedKg.toFixed(1)} kg is expected to reach community members.</small>
                            <small className="demoRouteOperational">The comparison includes the impact of food recovery, food not distributed, and travel.</small>
                          </>}
                          {activeDemoStep.id === "participation" && <>
                            <small className="demoRouteEquation">{demoPercent(route.acceptanceProbability, 1)} estimated fit for this driver.</small>
                            <small className="demoRouteOperational">{route.driveMinutes.toFixed(0)} minutes of driving, with the driver’s schedule and area considered.</small>
                          </>}
                          {activeDemoStep.id === "objective" && <>
                            <small className="demoRouteEquation">This score balances food recovery, pantry service, environmental impact, and driver fit.</small>
                          </>}
                          {activeDemoStep.id === "selection" && <>
                            <small className="demoRouteEquation">{route.id === chosenRouteId ? "This is the recommended route." : "This route was not the strongest overall match."}</small>
                            <small className="demoRouteOperational">Depart {route.departureLabel} → pickup {route.pickupLabel} → pantry {route.arrivalLabel} → finish {route.finishLabel}</small>
                          </>}
                          <small className="demoRouteOperational">
                            {route.distanceMiles.toFixed(1)} route miles · depart {route.departureLabel}
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
                  <small>Available through {demoData.request.searchUntilLabel}</small>
                  <small>ZIP {demoData.request.startZipCode} start area → ZIP {demoData.request.destinationZipCode} destination area</small>
                </div>
                <div className="demoNetworkFunnel" aria-label="optimization network counts">
                  <span>Route progress</span>
                  <div className="demoNetworkCounts">
                    <div className={`demoNetworkCount ${activeFunnelMetric === "network" ? "isCurrent" : ""}`}>
                      <strong>{networkNodeCount}</strong>
                      <small>Database partners</small>
                    </div>
                    <div className={`demoNetworkCount ${activeFunnelMetric === "generated" ? "isCurrent" : ""}`}>
                      <strong>{generatedCombinationCount}</strong>
                      <small>Options checked</small>
                    </div>
                    <div className={`demoNetworkCount demoNetworkCountRejected ${activeDemoStep.id === "feasibility" ? "isCurrent" : ""}`}>
                      <strong>{rejectedCombinationCount}</strong>
                      <small>Unavailable options</small>
                    </div>
                    <div className={`demoNetworkCount ${activeFunnelMetric === "feasible" ? "isCurrent" : ""}`}>
                      <strong>{feasibleRouteCount}</strong>
                      <small>Available routes</small>
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
                <ul>
                  {activeDemoStep.mipLines.map((line) => <li key={line}>{line}</li>)}
                </ul>
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
