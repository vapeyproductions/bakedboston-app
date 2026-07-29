"use client";

import { useEffect, useMemo, useState } from "react";

type Route = {
  id: number;
  bakery: string;
  pantry: string;
  food: string;
  pounds: number;
  pickup: string;
  distance: number;
  minutes: number;
  urgency: "High" | "Medium";
  color: string;
};

const routes: Route[] = [
  { id: 1, bakery: "Flour & Field", pantry: "Harbor Community Pantry", food: "Artisan bread + produce", pounds: 42, pickup: "4:15–4:45 PM", distance: 2.4, minutes: 18, urgency: "High", color: "#ef6548" },
  { id: 2, bakery: "Morning Bell Bakery", pantry: "Northside Food Shelf", food: "Pastries + fruit", pounds: 28, pickup: "5:00–5:30 PM", distance: 3.1, minutes: 24, urgency: "Medium", color: "#f4bf43" },
  { id: 3, bakery: "Grain House", pantry: "St. Anne's Cupboard", food: "Sandwiches + loaves", pounds: 17, pickup: "5:30–6:00 PM", distance: 1.8, minutes: 14, urgency: "Medium", color: "#4e8b6b" },
];

const pins = [
  { label: "Flour & Field", type: "B", left: "18%", top: "28%", color: "#ef6548" },
  { label: "Harbor Pantry", type: "P", left: "67%", top: "18%", color: "#163d2d" },
  { label: "Morning Bell", type: "B", left: "28%", top: "68%", color: "#f4bf43" },
  { label: "Northside Shelf", type: "P", left: "80%", top: "66%", color: "#163d2d" },
  { label: "Grain House", type: "B", left: "50%", top: "48%", color: "#ef6548" },
  { label: "St. Anne's", type: "P", left: "63%", top: "77%", color: "#163d2d" },
];

export default function Home() {
  const [capacity, setCapacity] = useState(120);
  const [priority, setPriority] = useState<"balanced" | "carbon" | "speed">("balanced");
  const [optimized, setOptimized] = useState(true);
  const [claimed, setClaimed] = useState<number[]>([]);
  const [network, setNetwork] = useState({ bakeries: 0, pantries: 0, drivers: 0, completedThisWeek: 0, completedTotal: 0 });

  useEffect(() => { void fetch("/api/public/stats", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (data) setNetwork(data); }); }, []);

  const score = useMemo(() => {
    if (priority === "carbon") return { miles: 2.9, served: 3 };
    if (priority === "speed") return { miles: 3.5, served: 3 };
    return { miles: 3.2, served: 3 };
  }, [priority]);

  const runOptimizer = () => {
    setOptimized(false);
    window.setTimeout(() => setOptimized(true), 750);
  };

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
          <a href="#model">The model</a>
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
            <button className="textButton" onClick={() => document.getElementById("model")?.scrollIntoView({ behavior: "smooth" })}>See how routing works <span>↓</span></button>
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
            <div><small>OPTIMIZED LOOP</small><strong>{score.miles} mi <span>·</span> 30 min</strong></div>
            <div className="summaryImpact"><strong>{network.bakeries}</strong><small>registered bakeries</small></div>
            <div className="summaryImpact"><strong>{network.pantries}</strong><small>registered pantries</small></div>
          </div>
        </div>
      </section>

      <section className="impactBar" id="impact">
        <div><strong>{network.completedThisWeek}</strong><span>deliveries completed this week</span></div>
        <div><strong>{network.completedTotal}</strong><span>deliveries completed since BakedBoston began</span></div>
        <div><strong>{network.bakeries}</strong><span>registered bakeries</span></div>
        <div><strong>{network.pantries}</strong><span>registered pantries</span></div>
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
          <aside className="appQr"><div className="qrPlaceholder" aria-label="Scan to download BakedBoston">▦<span>▦</span><i>▦</i></div><strong>Scan to download<br />the BakedBoston app</strong><small>Driver routes are mobile-only.</small></aside>
        </div>
        <div className="routeLayout">
          <div className="routeList">
            {routes.map((route, index) => (
              <article className="routeCard" key={route.id}>
                <div className="routeNumber" style={{ background: route.color }}>{String(index + 1).padStart(2, "0")}</div>
                <div className="routeMain">
                  <div className="routeHead">
                    <div><h3>{route.bakery} <span>→</span> {route.pantry}</h3><p>{route.food} · {route.pounds} lb</p></div>
                    <span className={`urgency ${route.urgency.toLowerCase()}`}>{route.urgency} priority</span>
                  </div>
                  <div className="routeMeta">
                    <span>◷ {route.pickup}</span><span>↗ {route.distance} miles</span><span>≈ {route.minutes} min</span>
                    <button className={claimed.includes(route.id) ? "claimed" : ""} onClick={() => setClaimed((c) => c.includes(route.id) ? c.filter((id) => id !== route.id) : [...c, route.id])}>
                      {claimed.includes(route.id) ? "Claimed ✓" : "Claim stop"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <aside className="optimizer" id="model">
            <div className="optimizerHead"><span>✦</span><div><small>BAKEDBOSTON ENGINE</small><h3>Route optimizer</h3></div></div>
            <label>Vehicle capacity <strong>{capacity} lb</strong></label>
            <input aria-label="Vehicle capacity" type="range" min="60" max="180" step="10" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            <label>Optimize for</label>
            <div className="toggleGroup">
              {(["balanced", "carbon", "speed"] as const).map((item) => <button key={item} onClick={() => setPriority(item)} className={priority === item ? "active" : ""}>{item}</button>)}
            </div>
            <div className="constraints">
              <span><i>✓</i> Pickup windows</span><span><i>✓</i> Pantry demand</span><span><i>✓</i> Food freshness</span><span><i>✓</i> Driver capacity</span>
            </div>
            <button className="optimizeButton" onClick={runOptimizer}>{optimized ? "Run optimizer" : "Solving network…"} <span>→</span></button>
            <p className="solverNote"><i /> {optimized ? `Optimal solution found · ${score.served}/3 pantries served` : "Evaluating 2,184 feasible routes…"}</p>
          </aside>
        </div>
      </section>

      <section className="howSection" id="how">
        <div className="howIntro"><span className="kicker">HOW IT WORKS</span><h2>From surplus<br />to supper.</h2><p>A simple act, coordinated intelligently.</p></div>
        <div className="steps">
          <div><span>01</span><div className="stepIcon">🥖</div><h3>Bakeries post surplus</h3><p>Food type, quantity, and safe pickup window are added in under a minute.</p></div>
          <div><span>02</span><div className="stepIcon">✦</div><h3>We optimize the match</h3><p>Our model balances urgency, distance, availability, and pantry priority.</p></div>
          <div><span>03</span><div className="stepIcon">🚙</div><h3>Neighbors drive the loop</h3><p>Volunteers claim a route and deliver food while it’s still fresh.</p></div>
        </div>
      </section>

      <section className="modelSection">
        <div>
          <span className="kicker light">THE OPERATIONS RESEARCH</span>
          <h2>Less waste is<br />a solvable problem.</h2>
        </div>
        <div className="modelCopy">
          <p>BakedBoston uses a mixed-integer optimization model to match one confirmed bakery pickup with a feasible pantry receiving window and a volunteer driver’s time, origin, and preferred destination. Candidate routes are screened against real travel time, pickup and latest-arrival deadlines, pantry availability, and whether a bakery has already committed its single daily pickup.</p>
          <div className="formula">min <b>Σ</b> <i>cᵢⱼxᵢⱼ + λCO₂ + μwaste</i></div>
          <ul><li>Mixed-integer assignment and routing</li><li>Time-window and service-mode feasibility</li><li>Pantry priority based on recent receiving opportunities</li><li>Traffic-aware route estimates</li><li>Driver route-request matching</li><li>Explainable, carbon-aware scoring</li></ul>
          <a className="modelGithub" href="https://github.com/vapeyproductions/bakedboston-optimizer" target="_blank" rel="noreferrer">Explore the optimization model on GitHub ↗</a>
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
