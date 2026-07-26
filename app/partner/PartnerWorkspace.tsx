"use client";

import { useState } from "react";
import Link from "next/link";

type Kind = "bakery" | "pantry";

const bakeryActivity = [
  { title: "Today’s pickup", detail: "Ready 4:30 PM · pickup by 6:00 PM", status: "Awaiting driver" },
  { title: "Tuesday pickup", detail: "Delivered to Community Servings", status: "Completed" },
  { title: "Monday pickup", detail: "Delivered to Brighton Food Pantry", status: "Completed" },
];

const pantryActivity = [
  { title: "Incoming today", detail: "Flour Bakery · arrival by 5:40 PM", status: "Driver reserved" },
  { title: "Thursday delivery", detail: "Clear Flour Bread · received 3:18 PM", status: "Completed" },
  { title: "Tuesday delivery", detail: "Bakey · received 4:05 PM", status: "Completed" },
];

export default function PartnerWorkspace({ kind }: { kind: Kind }) {
  const bakery = kind === "bakery";
  const [section, setSection] = useState<"overview" | "schedule" | "activity">("overview");
  const [notice, setNotice] = useState("");
  const [available, setAvailable] = useState(true);
  const activity = bakery ? bakeryActivity : pantryActivity;

  function prototypeAction(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  return <main className={`partnerWorkspace ${kind}`}>
    <aside className="partnerSidebar">
      <Link className="partnerBrand sideBrand" href="/"><span>B</span><strong>BakedBoston</strong></Link>
      <div className="organizationBadge">
        <span>{bakery ? "🥖" : "🥫"}</span>
        <div><small>{bakery ? "BAKERY" : "PANTRY"} WORKSPACE</small><strong>{bakery ? "Sample Boston Bakery" : "Sample Community Pantry"}</strong></div>
      </div>
      <nav className="workspaceTabs">
        <button className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}><span>⌂</span> Overview</button>
        <button className={section === "schedule" ? "active" : ""} onClick={() => setSection("schedule")}><span>◷</span> {bakery ? "Pickup schedule" : "Receiving schedule"}</button>
        <button className={section === "activity" ? "active" : ""} onClick={() => setSection("activity")}><span>↗</span> Delivery activity</button>
      </nav>
      <div className="sideBottom"><span className="demoPill">PROTOTYPE MODE</span><Link href="/partners">Switch workspace</Link></div>
    </aside>

    <section className="workspaceMain">
      <header className="workspaceHeader">
        <div><p>{bakery ? "BAKERY PARTNER" : "PANTRY PARTNER"}</p><h1>{section === "overview" ? "Good afternoon." : section === "schedule" ? (bakery ? "Pickup schedule" : "Receiving schedule") : "Delivery activity"}</h1></div>
        <button className="profileButton">{bakery ? "SB" : "SC"} <span>⌄</span></button>
      </header>
      {notice && <div className="prototypeNotice">{notice}</div>}

      {section === "overview" && <>
        <div className="statusBanner">
          <div><span className={available ? "statusLight on" : "statusLight"} /><small>{available ? "AVAILABLE TODAY" : "PAUSED TODAY"}</small>
            <h2>{available ? (bakery ? "Your surplus can be matched." : "You’re ready to receive.") : "Today’s participation is paused."}</h2>
            <p>{bakery ? "Food ready at 4:30 PM · pickup deadline 6:00 PM" : "Open 10:00 AM–7:00 PM · latest arrival 6:30 PM"}</p></div>
          <button onClick={() => setAvailable((value) => !value)}>{available ? "Pause today" : "Resume today"}</button>
        </div>
        <div className="metricGrid">
          <article><small>{bakery ? "RESCUES THIS MONTH" : "DELIVERIES THIS MONTH"}</small><strong>{bakery ? "12" : "8"}</strong><p>{bakery ? "3 more than last month" : "Across 6 receiving windows"}</p></article>
          <article><small>{bakery ? "PICKUP SUCCESS" : "ARRIVALS RECEIVED"}</small><strong>{bakery ? "92%" : "100%"}</strong><p>{bakery ? "11 of 12 completed" : "8 of 8 completed"}</p></article>
          <article><small>{bakery ? "NEXT PICKUP" : "NEXT ARRIVAL"}</small><strong>Today</strong><p>{bakery ? "Ready at 4:30 PM" : "Expected by 5:40 PM"}</p></article>
        </div>
        <div className="workspaceGrid">
          <article className="actionPanel">
            <span className="panelKicker">{bakery ? "TODAY’S SURPLUS" : "TODAY’S CAPACITY"}</span>
            <h2>{bakery ? "Have food ready to rescue?" : "Can you accept a delivery?"}</h2>
            <p>{bakery ? "Create a pickup using today’s saved hours. A driver will see it once the optimizer selects a pantry." : "Confirm that today’s receiving window and latest permitted arrival are still accurate."}</p>
            <button onClick={() => prototypeAction(bakery ? "Pickup publishing will activate when partner accounts are connected." : "Receiving confirmation will activate when partner accounts are connected.")}>{bakery ? "Publish today’s pickup" : "Confirm today’s window"} <span>→</span></button>
          </article>
          <ActivityCard activity={activity.slice(0, 2)} onAll={() => setSection("activity")} />
        </div>
      </>}

      {section === "schedule" && <ScheduleEditor kind={kind} onSave={() => prototypeAction("Schedule changes are preview-only until secure partner accounts are connected.")} />}
      {section === "activity" && <div className="activityPage"><div className="sectionIntro"><span className="panelKicker">RESCUE HISTORY</span><h2>{bakery ? "Your pickups" : "Your deliveries"}</h2><p>Reserved, ongoing, and completed rescues will appear here automatically.</p></div><ActivityCard activity={activity} /></div>}
    </section>
  </main>;
}

function ActivityCard({ activity, onAll }: { activity: typeof bakeryActivity; onAll?: () => void }) {
  return <article className="activityPanel">
    <div className="panelHeading"><div><span className="panelKicker">RECENT ACTIVITY</span><h2>Rescue updates</h2></div>{onAll && <button onClick={onAll}>View all</button>}</div>
    {activity.map((item) => <div className="activityRow" key={`${item.title}-${item.detail}`}><span className={item.status === "Completed" ? "activityDot complete" : "activityDot"} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><b>{item.status}</b></div>)}
  </article>;
}

function ScheduleEditor({ kind, onSave }: { kind: Kind; onSave: () => void }) {
  const bakery = kind === "bakery";
  const [rows, setRows] = useState([
    { day: bakery ? "Monday" : "Wednesday", detail: bakery ? "4:30 PM — 6:00 PM" : "10:00 AM — 1:00 PM · latest 12:30 PM" },
    { day: bakery ? "Wednesday" : "Wednesday", detail: bakery ? "4:30 PM — 6:00 PM" : "4:00 PM — 7:00 PM · latest 6:30 PM" },
    { day: bakery ? "Friday" : "2nd Saturday", detail: bakery ? "3:30 PM — 5:30 PM" : "9:00 AM — 12:00 PM · latest 11:30 AM" },
  ]);
  return <div className="schedulePage">
    <div className="sectionIntro"><span className="panelKicker">RECURRING AVAILABILITY</span><h2>{bakery ? "When is surplus ready?" : "When can you receive?"}</h2><p>{bakery ? "Each day may have its own food-ready time and pickup deadline." : "Use multiple daily windows or monthly rules such as the second Saturday."}</p></div>
    <article className="schedulePanel">
      {rows.map((row, index) => <div className="scheduleRow" key={`${row.day}-${index}`}><span>{row.day.slice(0, 3).toUpperCase()}</span><div><strong>{row.day}</strong><small>{row.detail}</small></div><button onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></div>)}
      <button className="addWindow" onClick={() => setRows((current) => [...current, { day: "New window", detail: "Choose times during account setup" }])}>+ Add {bakery ? "pickup day" : "receiving window"}</button>
      <div className="scheduleActions"><button onClick={onSave}>Save schedule</button></div>
    </article>
  </div>;
}
