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
  priority: number;
  waitingPenalty: number;
  destinationPenalty: number;
  points: string;
};

type DemoDataset = {
  nodes: DemoNode[];
  candidates: DemoRoute[];
  highlightedRouteId: string | null;
  liveRouteLabel: string;
  liveRouteContext: string;
};

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
    label: "1 · Full network",
    title: "Start with the full network of bakeries and pantries.",
    description: "The map begins with the full partner network so you can see the available bakeries and pantries before the optimizer narrows the field.",
    scoreTitle: "Map status",
    scoreValue: "Full network of bakeries and pantries",
    scoreNote: "All partner locations appear before the feasibility screen removes the ones that cannot participate",
    mipTitle: "Decision variables",
    mipBody: "The mixed-integer model starts by defining a binary variable for every bakery–pantry–driver assignment that could possibly exist.",
    mipLines: [
      "x[b,p,d] = 1 if bakery b is assigned to pantry p and driver d",
      "x[b,p,d] = 0 otherwise",
      "Only feasible assignments move forward to screening",
    ],
    mipEquation: "x[b,p,d] ∈ {0,1}",
  },
  {
    id: "windows",
    label: "2 · Open windows",
    title: "Closed or misaligned locations are removed.",
    description: "The optimizer filters out bakeries and pantries that are closed or whose windows do not overlap, leaving only the locations that can participate in the same route.",
    scoreTitle: "Feasibility screen",
    scoreValue: "Closed and unaligned windows removed",
    scoreNote: "Only partners with matching open windows stay in the candidate pool",
    mipTitle: "Hard constraints",
    mipBody: "Any assignment that violates time windows or service rules is forced to 0 and removed from the model.",
    mipLines: [
      "Bakery must be confirmed and available",
      "Pantry must be open and receiving",
      "Travel must fit pickup and delivery deadlines",
    ],
    mipEquation: "x[b,p,d] = 0 for any route that violates a time window",
  },
  {
    id: "scoring",
    label: "3 · Scoring",
    title: "Each feasible route gets a score.",
    description: "The remaining routes are scored using pantry priority, travel distance, waiting time, and driver route fit.",
    scoreTitle: "Candidate scores",
    scoreValue: "Live scoring",
    scoreNote: "High-priority pantries earn a boost, while longer or less efficient routes fall down the list",
    mipTitle: "Objective",
    mipBody: "The model maximizes route quality while penalizing wasted driving and poor timing fit.",
    mipLines: [
      "reward pantry priority",
      "penalize drive time and waiting",
      "penalize poor destination fit for the driver",
    ],
    mipEquation: "maximize  priority − drive − wait − destination mismatch",
  },
  {
    id: "match",
    label: "4 · Match selected",
    title: "The highest-scoring feasible route becomes the match.",
    description: "One assignment is selected and offered to the driver, while the other candidate routes stay at zero and fall away.",
    scoreTitle: "Chosen route",
    scoreValue: "Selected match",
    scoreNote: "One pickup, one pantry, one driver assignment",
    mipTitle: "Binary choice",
    mipBody: "At the end of the solve, one assignment flips to 1 and every competing assignment remains 0.",
    mipLines: [
      "selected assignment = 1",
      "all other candidates = 0",
      "the chosen bakery pickup is removed from the pool",
    ],
    mipEquation: "Σ x[b,p,d] ≤ 1 for each bakery pickup window",
  },
];

const fallbackDemoNodes: DemoNode[] = [
  { id: "bakery-lena", label: "Lena's Bakery", type: "Bakery", short: "🥖", left: "21%", top: "56%" },
  { id: "bakery-harbor", label: "Harbor Bakes", type: "Bakery", short: "🥖", left: "32%", top: "28%" },
  { id: "pantry-moughan", label: "Moughan Food Pantry", type: "Pantry", short: "🥫", left: "72%", top: "41%" },
  { id: "pantry-north-end", label: "North End Pantry", type: "Pantry", short: "🥫", left: "76%", top: "21%" },
  { id: "pantry-roxbury", label: "Roxbury Pantry", type: "Pantry", short: "🥫", left: "58%", top: "72%" },
  { id: "driver-request", label: "Driver request", type: "Driver", short: "🚗", left: "46%", top: "62%" },
  { id: "closed-bakery", label: "Closed bakery", type: "Bakery", short: "🥖", left: "12%", top: "20%", isClosed: true },
  { id: "closed-pantry", label: "Closed pantry", type: "Pantry", short: "🥫", left: "83%", top: "78%", isClosed: true },
];

const fallbackDemoRoutes: DemoRoute[] = [
  {
    id: "route-a",
    label: "Candidate A",
    bakery: "Lena's Bakery",
    pantry: "Moughan Food Pantry",
    drive: "3.2 mi",
    score: "92.4",
    distanceMiles: 3.2,
    priority: 100,
    waitingPenalty: 8,
    destinationPenalty: 6,
    points: "21,56 46,62 72,41",
  },
  {
    id: "route-b",
    label: "Candidate B",
    bakery: "Harbor Bakes",
    pantry: "North End Pantry",
    drive: "4.8 mi",
    score: "77.1",
    distanceMiles: 4.8,
    priority: 50,
    waitingPenalty: 10,
    destinationPenalty: 7.5,
    points: "32,28 46,62 76,21",
  },
  {
    id: "route-c",
    label: "Candidate C",
    bakery: "Lena's Bakery",
    pantry: "Roxbury Pantry",
    drive: "5.1 mi",
    score: "71.6",
    distanceMiles: 5.1,
    priority: 33.3,
    waitingPenalty: 12,
    destinationPenalty: 9,
    points: "21,56 46,62 58,72",
  },
];

const fallbackDemoData: DemoDataset = {
  nodes: fallbackDemoNodes,
  candidates: fallbackDemoRoutes,
  highlightedRouteId: "route-a",
  liveRouteLabel: "Lena's Bakery → Moughan Food Pantry",
  liveRouteContext: "Demo route based on the current registered network.",
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
  const activeRoutes = demoData.candidates.map((route) => route.id);
  const visibleCandidates = demoData.candidates.filter((route) => activeRoutes.includes(route.id));
  const selectedCandidate = demoData.candidates.find((route) => route.id === chosenRouteId) ?? null;

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
          <div><span>01</span><div className="stepIcon">🥖</div><h3>Bakeries post surplus</h3><p>Food type, quantity, and safe pickup window are added in under a minute.</p></div>
          <div><span>02</span><div className="stepIcon">✦</div><h3>We optimize the match</h3><p>Our model balances urgency, distance, availability, and pantry priority.</p></div>
          <div><span>03</span><div className="stepIcon">🚙</div><h3>Neighbors drive the loop</h3><p>Volunteers claim a route and deliver food while it’s still fresh.</p></div>
        </div>
      </section>

      <section className="modelSection" id="model">
        <div>
          <span className="kicker light">THE OPERATIONS RESEARCH</span>
          <h2>Less waste is<br />a solvable problem.</h2>
        </div>
        <div className="modelCopy">
          <p>BakedBoston uses a mixed-integer optimization model to match each confirmed bakery pickup with a feasible pantry receiving window and a volunteer driver. The model decides which bakery–pantry–driver combinations should be offered while respecting the practical limits of a real delivery.</p>
          <div className="formula">min <b>Σ</b> <i>(travel time + route distance + lateness risk − pantry priority)</i></div>
          <div className="modelDetails"><div><strong>What is optimized</strong><p>The solver evaluates feasible bakery–pantry–driver combinations and chooses the assignment with the strongest overall score while preventing duplicate pickup assignments.</p></div><div><strong>Pantry priority</strong><p>Each pantry receives a higher priority value when it has had fewer recent receiving opportunities. In the live scoring layer, that appears as an inverse relationship to the rolling seven-day delivery count.</p></div><div><strong>Hard constraints</strong><p>Every route must reach the bakery before its pickup deadline, reach the pantry before its acceptance cutoff, use an open and confirmed pantry window, and assign a bakery pickup only once.</p></div><div><strong>Live inputs</strong><p>Google travel estimates, partner coordinates, recurring and one-time availability, driver origin/destination preferences, and rolling pantry priority data update the available network.</p></div></div>
          <div className="modelMiniBoard">
            <div><small>Decision variable</small><strong>{"x[b,p,d] ∈ {0,1}"}</strong><p>1 means a bakery b is matched to pantry p and driver d.</p></div>
            <div><small>Objective</small><strong>maximize route quality</strong><p>Priority is rewarded; drive time, waiting, and poor route fit are penalized.</p></div>
            <div><small>Constraint</small><strong>one pickup, one assignment</strong><p>A bakery pickup window can only be assigned once, even if several candidate routes are feasible.</p></div>
          </div>
          <ul><li>Mixed-integer assignment and routing</li><li>Time-window and service-mode feasibility</li><li>Pantry priority based on recent receiving opportunities</li><li>Traffic-aware route estimates</li><li>Driver route-request matching</li></ul>
          <a className="modelGithub" href="https://github.com/vapeyproductions/bakedboston-optimizer" target="_blank" rel="noreferrer">Explore the optimization model on GitHub ↗</a>
        </div>
        <div className="demoSection" id="live-demo">
          <div className="demoIntro">
            <span className="kicker light">LIVE MATCH WALKTHROUGH</span>
            <h3>See a delivery get matched in four steps.</h3>
            <p>{demoData.liveRouteContext} The scoring sidebar stays visible, and the MIP panel shows how the model prunes, scores, and selects one binary assignment.</p>
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
            <div className="demoMap">
              <div className="demoMapHeader">
                <span>Boston delivery network</span>
                <small>{demoData.liveRouteLabel}</small>
              </div>
              <div className="demoMapCanvas">
                <div className="demoWater" />
                <div className="demoPark" />
                <svg className="demoRoutesSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {demoData.candidates.filter((route) => activeRoutes.includes(route.id)).map((route) => {
                    const isChosen = activeDemoStep.id === "match" && chosenRouteId === route.id;
                    const points = route.points.split(" ").map((point) => point.split(",").map(Number));
                    const [, mid, end] = points;
                    const labelX = Math.max(8, Math.min(92, ((mid?.[0] ?? 0) + (end?.[0] ?? 0)) / 2));
                    const labelY = Math.max(8, Math.min(92, ((mid?.[1] ?? 0) + (end?.[1] ?? 0)) / 2 - 3));
                    return (
                      <g key={route.id}>
                        <polyline
                          points={route.points}
                          className={isChosen ? "chosen" : "candidate"}
                        />
                        <g className={`demoRouteTag ${isChosen ? "isChosen" : ""}`} transform={`translate(${labelX} ${labelY})`}>
                          <rect x="-3.5" y="-3.1" width="7" height="6.2" rx="1.5" ry="1.5" />
                          <text textAnchor="middle" dominantBaseline="central">{route.label}</text>
                        </g>
                      </g>
                    );
                  })}
                </svg>
                {demoData.nodes.map((node) => (
                  <div
                    key={node.id}
                    className={`demoNode demoNode${node.type} ${activeNodeIds.includes(node.id) ? "isActive" : ""} ${node.isClosed && activeDemoStep.id === "network" ? "isClosed" : ""} ${node.isClosed && activeDemoStep.id !== "network" ? "isHidden" : ""}`}
                    style={{ left: node.left, top: node.top }}
                  >
                    <span className="demoNodePin">{node.short}</span>
                    <div className="demoNodeLabel">
                      <strong>{node.label}</strong>
                      <small>{node.type}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="demoSidebar">
              <div className="demoStepCard">
                <small>{activeDemoStep.label}</small>
                <h4>{activeDemoStep.title}</h4>
                <p>{activeDemoStep.description}</p>
              </div>
              <div className="demoScoreCard">
                <span>Route score</span>
                <strong>{activeDemoStep.id === "match" && selectedCandidate ? selectedCandidate.score : activeDemoStep.scoreValue}</strong>
                <p>{activeDemoStep.id === "match" && selectedCandidate ? `${selectedCandidate.bakery} → ${selectedCandidate.pantry}` : activeDemoStep.scoreNote}</p>
              </div>
              <div className="demoMipCard">
                <small>{activeDemoStep.mipTitle}</small>
                <p>{activeDemoStep.mipBody}</p>
                <div className="demoMipEquation">{activeDemoStep.mipEquation}</div>
                <ul>
                  {activeDemoStep.mipLines.map((line) => <li key={line}>{line}</li>)}
                </ul>
                <div className="demoMipMatrix" aria-label="assignment matrix preview">
                  {demoData.candidates.slice(0, 3).map((route) => {
                    const active = activeDemoStep.id === "match" && route.id === chosenRouteId;
                    const eliminated = activeDemoStep.id === "windows" && route.id !== chosenRouteId;
                    return (
                      <div key={route.id} className={`demoMipMatrixRow ${active ? "isActive" : ""} ${eliminated ? "isDim" : ""}`}>
                        <span>{route.label}</span>
                        <b>{active ? "1" : "0"}</b>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="demoCandidateList">
                {visibleCandidates.map((route) => {
                  const isChosen = activeDemoStep.id === "match" && chosenRouteId === route.id;
                  return (
                    <div key={route.id} className={`demoCandidate ${isChosen ? "isChosen" : ""}`}>
                      <div className="demoCandidateTop">
                        <b>{route.label}</b>
                        <span>{route.score}</span>
                      </div>
                      <p><strong>Bakery:</strong> {route.bakery}</p>
                      <p><strong>Pantry:</strong> {route.pantry}</p>
                      <small>{route.drive} · priority {route.priority.toFixed(1)} · wait penalty {route.waitingPenalty.toFixed(0)}</small>
                    </div>
                  );
                })}
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
