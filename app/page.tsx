"use client";

import { useEffect, useState } from "react";

const pins = [
  { label: "Flour & Field", type: "B", left: "18%", top: "28%", color: "#ef6548" },
  { label: "Harbor Pantry", type: "P", left: "67%", top: "18%", color: "#163d2d" },
  { label: "Morning Bell", type: "B", left: "28%", top: "68%", color: "#f4bf43" },
  { label: "Northside Shelf", type: "P", left: "80%", top: "66%", color: "#163d2d" },
  { label: "Grain House", type: "B", left: "50%", top: "48%", color: "#ef6548" },
  { label: "St. Anne's", type: "P", left: "63%", top: "77%", color: "#163d2d" },
];

export default function Home() {
  const [network, setNetwork] = useState({ bakeries: 0, pantries: 0, drivers: 0, completedThisWeek: 0, completedTotal: 0, averagePantriesHelpedPerDay: 0 });
  const scrollToModel = () => document.getElementById("model")?.scrollIntoView({ behavior: "smooth", block: "start" });

  useEffect(() => { void fetch("/api/public/stats", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (data) setNetwork(data); }); }, []);

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
          <aside className="appQr"><div className="qrPlaceholder" aria-label="Scan to download BakedBoston">▦<span>▦</span><i>▦</i></div><strong>Scan to download<br />the BakedBoston app</strong><small>Driver routes are mobile-only.</small></aside>
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
          <div className="modelDetails"><div><strong>What is minimized</strong><p>Total predicted driving time and distance, with penalties for routes that approach pickup deadlines or a pantry’s latest permitted arrival.</p></div><div><strong>How a route is scored</strong><p>Feasible routes receive higher scores when they are short, fit a driver’s requested time and direction, and serve a pantry that has received fewer recent delivery opportunities.</p></div><div><strong>Hard constraints</strong><p>Every route must reach the bakery before its pickup deadline, reach the pantry before its acceptance cutoff, use an open and confirmed staffed pantry window (or unattended window), and assign a bakery pickup only once.</p></div><div><strong>Live inputs</strong><p>Google travel estimates, partner coordinates, recurring and one-time availability, driver origin/destination preferences, and rolling pantry priority data update the available network.</p></div></div>
          <ul><li>Mixed-integer assignment and routing</li><li>Time-window and service-mode feasibility</li><li>Pantry priority based on recent receiving opportunities</li><li>Traffic-aware route estimates</li><li>Driver route-request matching</li></ul>
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
