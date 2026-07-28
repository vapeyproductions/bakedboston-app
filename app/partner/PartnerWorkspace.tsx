"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "../availability-calendar.css";
import "../profile-layout.css";
import "../partner-notifications.css";
import "../partner-status.css";

type Kind = "bakery" | "pantry";
type Organization = {
  id: number; name: string; address: string; contactName: string; contactEmail: string;
  contactPhone: string; businessPhone: string; notificationPhone: string; dropoffInstructions?: string;
  recurringDays: string; businessOpenTime?: string; businessCloseTime?: string; readyTime?: string; arrivalDeadline?: string;
  openTime?: string; closeTime?: string; latestArrival?: string; serviceModes?: string;
};
type Account = {
  id: number; accountEmail: string; administratorName: string; contactEmail: string;
  contactPhone: string;
};
type Contact = { id: number; name: string; email: string; phone: string; isPrimary: boolean };
type AccessPhoto = { id: number; imageUrl: string; pathname: string; caption: string };
type Route = { id: number; bakeryName: string; pantryName: string; driverName: string; scheduledArrival: string; status: "reserved" | "ongoing" | "completed" | "cancelled"; createdAt: string | Date };
type OneTimeWindow = { id: number; startsAt: string; endsAt: string; latestArrival: string; serviceMode: "staffed" | "unattended"; paused: boolean };
type AvailabilityPause = { id: number; endsAt: string };
type ScheduleException = { id: number; exceptionDate: string };
type PickupOccurrence = {
  id: number; serviceDate: string; pickupWindowStartsAt: string; pickupDeadline: string;
  status: "scheduled" | "awaiting_confirmation" | "confirmed" | "decision_deferred" | "insufficient_food" | "reserved" | "cancelled";
  confirmedAt: string | null;
};
type PartnerNotification = { id: number; title: string; body: string; actionRequired: boolean; actionKey: string; readAt: string | null; acknowledgedAt: string | null; createdAt: string };

export default function PartnerWorkspace({ kind, organization, account, contacts, photos = [], routes = [] }: {
  kind: Kind; organization: Organization; account: Account; contacts: Contact[]; photos?: AccessPhoto[]; routes?: Route[];
}) {
  const bakery = kind === "bakery";
  const [section, setSection] = useState<"overview" | "schedule" | "activity" | "profile" | "report">("overview");
  const [notice, setNotice] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [oneTimeWindows, setOneTimeWindows] = useState<OneTimeWindow[]>([]);
  const [availabilityPauses, setAvailabilityPauses] = useState<AvailabilityPause[]>([]);
  const [scheduleExceptions, setScheduleExceptions] = useState<ScheduleException[]>([]);
  const [availabilityDialog, setAvailabilityDialog] = useState(false);
  const [pickupOccurrences, setPickupOccurrences] = useState<PickupOccurrence[]>([]);
  const [pickupBusy, setPickupBusy] = useState(false);
  const [notifications, setNotifications] = useState<PartnerNotification[]>([]);
  const priorityNotification = notifications.find((notification) => notification.actionRequired && !notification.acknowledgedAt) ?? notifications[0];
  const [windowDraft, setWindowDraft] = useState({ date: "", starts: "", ends: "", latest: "", serviceMode: "staffed" as "staffed" | "unattended" });
  const scheduledOpen = organizationIsOpen(kind, organization, new Date()) && !scheduleExceptions.some((exception) => exception.exceptionDate === localDate(new Date()));
  const schedulePaused = availabilityPauses.some((pause) => new Date(pause.endsAt) > new Date());
  const activeOneTime = oneTimeWindows.find((window) => !window.paused && new Date(window.startsAt) <= new Date() && new Date(window.endsAt) > new Date());
  const pausedOneTime = oneTimeWindows.find((window) => window.paused && new Date(window.startsAt) <= new Date() && new Date(window.endsAt) > new Date());
  const todayPickup = pickupOccurrences.find((item) => item.serviceDate === localDate(new Date()));
  const pickupConfirmed = todayPickup?.status === "confirmed" || todayPickup?.status === "reserved";
  const recurringAvailable = scheduledOpen && !schedulePaused && (!bakery || pickupConfirmed);
  const available = recurringAvailable || Boolean(activeOneTime);
  const activity = routes.map((route) => ({ title: bakery ? `Delivery to ${route.pantryName}` : `Delivery from ${route.bakeryName}`, detail: `${route.driverName} · ${route.scheduledArrival}`, status: route.status }));
  const primaryContact = contacts.find((contact) => contact.isPrimary) ?? contacts[0];
  async function refreshAvailability() {
    const [response, exceptionResponse] = await Promise.all([fetch("/api/partner/availability", { cache: "no-store" }), fetch("/api/partner/schedule-exceptions", { cache: "no-store" })]);
    const [data, exceptionData] = await Promise.all([response.json().catch(() => null), exceptionResponse.json().catch(() => null)]);
    if (response.ok) { setOneTimeWindows(data.windows ?? []); setAvailabilityPauses(data.pauses ?? []); }
    if (exceptionResponse.ok) setScheduleExceptions(exceptionData.exceptions ?? []);
  }
  // Initial hydration reads persisted one-time windows and pause state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshAvailability(); }, []);
  useEffect(() => {
    const refresh = () => fetch("/api/partner/notifications", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setNotifications(data.notifications ?? []); })
      .catch(() => undefined);
    void refresh();
    const timer = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!bakery) return;
    async function loadPickup() {
      const response = await fetch("/api/partner/pickups", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) return;
      let occurrences = (data.occurrences ?? []) as PickupOccurrence[];
      const today = localDate(new Date());
      if (!occurrences.some((occurrence) => occurrence.serviceDate === today)) {
        const pickupWindow = bakeryWindowForDate(organization, new Date());
        if (pickupWindow) {
          const create = await fetch("/api/partner/pickups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serviceDate: today,
              pickupWindowStartsAt: localDateTime(today, pickupWindow.readyTime),
              pickupDeadline: localDateTime(today, pickupWindow.pickupDeadline),
            }),
          });
          const created = await create.json().catch(() => null);
          if (create.ok) occurrences = [created.occurrence, ...occurrences];
        }
      }
      setPickupOccurrences(occurrences);
    }
    void loadPickup();
    const timer = window.setInterval(loadPickup, 20_000);
    return () => window.clearInterval(timer);
  }, [bakery, organization]);
  function showWindowDialog(useCurrentTime: boolean) {
    if (useCurrentTime && !window.confirm(`This will open ${organization.name} ${bakery ? "for pickup" : "to accept deliveries"} outside the saved recurring schedule. Continue?`)) return;
    const start = useCurrentTime ? new Date() : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const latest = new Date(end.getTime() - 15 * 60 * 1000);
    setWindowDraft({ date: localDate(start), starts: localTime(start), ends: localTime(end), latest: localTime(latest), serviceMode: "staffed" });
    setAvailabilityDialog(true);
  }
  async function createOneTimeWindow() {
    const startsAt = localDateTime(windowDraft.date, windowDraft.starts);
    const endsAt = localDateTime(windowDraft.date, windowDraft.ends);
    const latestArrival = bakery ? endsAt : localDateTime(windowDraft.date, windowDraft.latest);
    const response = await fetch("/api/partner/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startsAt, endsAt, latestArrival, serviceMode: bakery ? "staffed" : windowDraft.serviceMode }) });
    const data = await response.json().catch(() => null);
    if (response.ok) { setOneTimeWindows((current) => [...current, data.record]); setAvailabilityDialog(false); prototypeAction("One-time availability window created."); }
    else prototypeAction(data?.error ?? "Could not create this availability window.");
  }
  async function setOneTimePaused(window: OneTimeWindow, paused: boolean) {
    const response = await fetch("/api/partner/availability", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: window.id, paused }) });
    if (response.ok) setOneTimeWindows((current) => current.map((item) => item.id === window.id ? { ...item, paused } : item));
  }
  async function pauseSchedule() {
    const endsAt = scheduledAvailabilityEnd(kind, organization, new Date());
    const response = await fetch("/api/partner/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "pause", endsAt }) });
    const data = await response.json().catch(() => null);
    if (response.ok) setAvailabilityPauses((current) => [...current, data.record]);
  }
  async function resumeSchedule() {
    const pause = availabilityPauses[0]; if (!pause) return;
    const response = await fetch(`/api/partner/availability?type=pause&id=${pause.id}`, { method: "DELETE" });
    if (response.ok) setAvailabilityPauses((current) => current.filter((item) => item.id !== pause.id));
  }

  async function respondToPickup(status: "confirmed" | "decision_deferred" | "insufficient_food") {
    const occurrence = pickupOccurrences.find((item) => item.serviceDate === localDate(new Date()));
    if (!occurrence) return;
    const message = status === "confirmed"
      ? "Confirm that food will be available during this pickup window? Drivers may reserve the route after you confirm."
      : status === "insufficient_food"
        ? "Mark today as not having enough leftover food for a pickup?"
        : "";
    if (message && !window.confirm(message)) return;
    setPickupBusy(true);
    const response = await fetch("/api/partner/pickups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: occurrence.id, status }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setPickupOccurrences((current) => current.map((item) => item.id === occurrence.id ? data.occurrence : item));
      prototypeAction(status === "confirmed"
        ? data.matching?.matchedRequests
          ? `Pickup confirmed. ${data.matching.matchedRequests} saved driver request${data.matching.matchedRequests === 1 ? "" : "s"} matched.`
          : "Pickup confirmed. Drivers can now reserve a route that includes it."
        : status === "decision_deferred" ? "We’ll keep this pickup awaiting your decision." : "Today’s pickup was closed without changing your recurring schedule.");
    } else prototypeAction(data?.error ?? "Could not update today’s pickup.");
    setPickupBusy(false);
  }

  function prototypeAction(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  return <main className={`partnerWorkspace ${kind}`}>
    <aside className="partnerSidebar">
      <Link className="partnerBrand sideBrand" href="/"><span>B</span><strong>BakedBoston</strong></Link>
      <div className="organizationBadge">
        <span>{bakery ? "🥖" : "🥫"}</span>
        <div><small>{bakery ? "BAKERY" : "PANTRY"} WORKSPACE</small><strong>{organization.name}</strong></div>
      </div>
      <nav className="workspaceTabs">
        <button className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}><span>⌂</span> Overview</button>
        <button className={section === "activity" ? "active" : ""} onClick={() => setSection("activity")}><span>↗</span> Delivery activity</button>
        <button className={section === "schedule" ? "active" : ""} onClick={() => setSection("schedule")}><span>◷</span> {bakery ? "Pickup schedule" : "Receiving schedule"}</button>
        <button className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}><span>⚙</span> Profile & contacts</button>
        <button className={section === "report" ? "active" : ""} onClick={() => setSection("report")}><span>!</span> Report problem</button>
      </nav>
      <div className="sideBottom"><span>{account.accountEmail}</span><button onClick={async () => { await fetch("/api/partner/session", { method: "DELETE" }); window.location.href = "/partners"; }}>Sign out</button></div>
    </aside>

    <section className="workspaceMain">
      <header className="workspaceHeader">
        <div><p>{bakery ? "BAKERY PARTNER" : "PANTRY PARTNER"}</p><h1>{section === "overview" ? "Good afternoon." : section === "schedule" ? (bakery ? "Pickup schedule" : "Receiving schedule") : section === "activity" ? "Delivery activity" : section === "report" ? "Report a problem" : "Profile & contacts"}</h1></div>
        <div className="accountMenu"><button className="profileButton" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}>{(primaryContact?.name || organization.name).split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()} <span>⌄</span></button>{accountMenuOpen && <div className="accountDropdown"><strong>{organization.name}</strong><small>{account.accountEmail}</small><button onClick={() => { setSection("profile"); setAccountMenuOpen(false); }}>Profile & contacts</button><button onClick={async () => { await fetch("/api/partner/session", { method: "DELETE" }); window.location.href = "/partners"; }}>Sign out</button></div>}</div>
      </header>
      {notice && <div className="prototypeNotice">{notice}</div>}

      {section === "overview" && <>
        <div className="statusBanner">
          <div><span className={available ? "statusLight on" : "statusLight"} /><small>{available ? "AVAILABLE NOW" : "CLOSED NOW"}</small>
            <h2>{available ? (activeOneTime ? `Open for a one-time ${bakery ? "pickup" : "receiving"} window.` : bakery ? "The confirmed pickup window is open." : "Open according to your receiving schedule.") : pausedOneTime || schedulePaused ? `${bakery ? "Pickup" : "Delivery"} availability is paused.` : bakery && scheduledOpen && !pickupConfirmed ? todayPickup?.status === "insufficient_food" ? "No pickup is available today." : "Today’s pickup window is awaiting confirmation." : (bakery ? "No pickup window is open right now." : "Closed according to your receiving schedule.")}</h2>
            <p>{activeOneTime ? `${new Date(activeOneTime.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${new Date(activeOneTime.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${bakery ? "" : ` · Latest arrival ${new Date(activeOneTime.latestArrival).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}` : pausedOneTime ? `One-time window paused · scheduled to end ${new Date(pausedOneTime.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : schedulePaused ? "The current recurring window is paused." : recurringAvailable ? bakery ? "This window opened automatically because today’s pickup was confirmed." : "Availability is based on the saved organization schedule." : bakery && pickupConfirmed ? "Pickup confirmed. This card will open automatically when the pickup window begins." : bakery ? "Confirm today’s pickup before it can open for drivers." : "You can create a one-time receiving window if the pantry can accept deliveries."}</p>
            {priorityNotification && <StatusNotification notification={priorityNotification} onAcknowledge={async (notification, handoffAction, deliveryReceived) => {
              const pickupReady = notification.actionKey.startsWith("pickup-ready:");
              const handoff = notification.actionKey.startsWith("confirm-handoff:");
              const delivery = notification.actionKey.startsWith("confirm-delivery:");
              const response = await fetch("/api/partner/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pickupReady
                ? { action: "pickup-ready", offerId: Number(notification.actionKey.split(":")[1]) }
                : handoff
                  ? { action: handoffAction ?? "confirm-handoff", offerId: Number(notification.actionKey.split(":")[1]) }
                  : delivery
                    ? { action: "confirm-delivery", offerId: Number(notification.actionKey.split(":")[1]), received: deliveryReceived }
                  : { id: notification.id, acknowledge: true }) });
              if (response.ok) setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString(), acknowledgedAt: new Date().toISOString() } : item));
            }} />}
            {bakery && <BakeryPickupConfirmation occurrence={todayPickup} busy={pickupBusy} onRespond={respondToPickup} showSummary={!notifications[0]} />}
          </div>
          <div className="statusActions">
            {activeOneTime && <button onClick={() => setOneTimePaused(activeOneTime, true)}>Pause availability</button>}
            {pausedOneTime && <button onClick={() => setOneTimePaused(pausedOneTime, false)}>Resume availability</button>}
            {recurringAvailable && !activeOneTime && !pausedOneTime && <button onClick={pauseSchedule}>Pause availability</button>}
            {scheduledOpen && schedulePaused && !activeOneTime && !pausedOneTime && <button onClick={resumeSchedule}>Resume availability</button>}
            {!scheduledOpen && !activeOneTime && !pausedOneTime && <button onClick={() => showWindowDialog(true)}>{bakery ? "Start pickup window" : "Open to accept deliveries"}</button>}
          </div>
        </div>
        <div className="workspaceGrid singleActivity"><ActivityCard activity={activity.slice(0, 3)} onAll={() => setSection("activity")} /></div>
      </>}

      {section === "schedule" && <ScheduleEditor kind={kind} organization={organization} onSaved={prototypeAction} oneTimeWindows={oneTimeWindows} scheduleExceptions={scheduleExceptions} onWindowsChanged={refreshAvailability} onAddOneTime={() => showWindowDialog(false)} />}
      {section === "activity" && <div className="activityPage"><div className="sectionIntro"><span className="panelKicker">DELIVERY HISTORY</span><h2>{bakery ? "Your pickups" : "Your deliveries"}</h2><p>Reserved, ongoing, and completed deliveries will appear here automatically.</p></div><ActivityCard activity={activity} /></div>}
      {section === "profile" && <ProfileEditor kind={kind} organization={organization} account={account} contacts={contacts} photos={photos} onSaved={(message) => prototypeAction(message)} />}
      {section === "report" && <ReportProblemWeb />}
    </section>
    {availabilityDialog && <div className="availabilityBackdrop"><section className="availabilityDialog"><span className="panelKicker">ONE-TIME AVAILABILITY</span><h2>{bakery ? "Add a pickup window" : "Add a receiving window"}</h2><p>This creates a single dated window and does not change the recurring schedule.</p><label>Date<input type="date" min={localDate(new Date())} value={windowDraft.date} onChange={(event) => setWindowDraft((current) => ({ ...current, date: event.target.value }))} /></label><MinuteTimeInput label={bakery ? "Food ready" : "Opens"} value={windowDraft.starts} onChange={(value) => setWindowDraft((current) => ({ ...current, starts: value }))} /><MinuteTimeInput label={bakery ? "Pickup deadline" : "Closes"} value={windowDraft.ends} onChange={(value) => setWindowDraft((current) => ({ ...current, ends: value }))} />{!bakery && <><MinuteTimeInput label="Latest permitted arrival" value={windowDraft.latest} onChange={(value) => setWindowDraft((current) => ({ ...current, latest: value }))} /><ServiceModeSelect value={windowDraft.serviceMode} onChange={(serviceMode) => setWindowDraft((current) => ({ ...current, serviceMode }))} /></>}<div><button onClick={() => setAvailabilityDialog(false)}>Cancel</button><button className="confirmAvailability" onClick={createOneTimeWindow}>Confirm availability</button></div></section></div>}
  </main>;
}

function ReportProblemWeb() {
  const [category, setCategory] = useState("technical_problem");
  const [urgency, setUrgency] = useState<"routine" | "urgent" | "safety">("routine");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/partner/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, urgency, details }) });
    const data = await response.json().catch(() => null);
    setMessage(response.ok ? "Your report was sent to the BakedBoston administrator team." : data?.error ?? "Could not send this report.");
    if (response.ok) setDetails("");
  }
  return <form className="reportProblemPanel" onSubmit={submit}>
    <p>Tell BakedBoston what happened. Reports can cover a failed pickup or delivery, incorrect instructions, a difficult interaction, notifications, or a technical problem.</p>
    <label>Problem type<select value={category} onChange={(event) => setCategory(event.target.value)}>{reportCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label>Urgency<select value={urgency} onChange={(event) => setUrgency(event.target.value as typeof urgency)}><option value="routine">Routine</option><option value="urgent">Urgent — help is needed soon</option><option value="safety">Safety concern</option></select></label>
    <label>What happened?<textarea required value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Include the delivery, time, people involved, and what help you need." /></label>
    <button type="submit">Send report</button>
    {(urgency === "urgent" || urgency === "safety") && <div className="supportCallout"><strong>Need help during an active delivery?</strong><a href="tel:+16172332956">Call BakedBoston support<br />617-233-2956</a>{urgency === "safety" && <small>If anyone is in immediate danger, call 911.</small>}</div>}
    {message && <p>{message}</p>}
  </form>;
}

const reportCategories = [
  ["failed_pickup", "Failed pickup"], ["failed_delivery", "Failed delivery"], ["food_unavailable", "Food unavailable"],
  ["driver_no_show", "Driver did not arrive"], ["organization_unavailable", "Organization unavailable"],
  ["incorrect_instructions", "Incorrect directions or instructions"], ["difficult_interaction", "Difficult interaction"],
  ["notification_problem", "Notification problem"], ["technical_problem", "Technical problem"], ["safety_concern", "Safety concern"], ["other", "Other"],
];

function BakeryPickupConfirmation({ occurrence, busy, onRespond, showSummary }: {
  occurrence?: PickupOccurrence; busy: boolean;
  onRespond: (status: "confirmed" | "decision_deferred" | "insufficient_food") => void;
  showSummary: boolean;
}) {
  if (!occurrence) return null;
  const confirmed = occurrence.status === "confirmed" || occurrence.status === "reserved";
  const unavailable = occurrence.status === "insufficient_food" || occurrence.status === "cancelled";
  return <section className={`statusCommitment ${showSummary ? "" : "controlsOnly"}`}>
    {showSummary && <><strong>{occurrence.status === "reserved" ? "A driver has reserved this pickup." : confirmed ? "Food availability confirmed." : unavailable ? "Marked unavailable today." : occurrence.status === "decision_deferred" ? "Decision postponed." : "Will food be available?"}</strong><span>{formatOccurrenceWindow(occurrence)}</span></>}
    {occurrence.status !== "reserved" && <div className="pickupConfirmationActions">
      {!confirmed && <button disabled={busy} className="confirmPickup" onClick={() => onRespond("confirmed")}>{unavailable ? "Change to food available" : "Food will be available"}</button>}
      {confirmed && <button disabled={busy} onClick={() => onRespond("insufficient_food")}>Change to not enough food</button>}
      {!confirmed && !unavailable && <button disabled={busy} onClick={() => onRespond("decision_deferred")}>Don’t know yet</button>}
      {!unavailable && !confirmed && <button disabled={busy} onClick={() => onRespond("insufficient_food")}>Not enough food today</button>}
    </div>}
  </section>;
}

function StatusNotification({ notification, onAcknowledge }: { notification: PartnerNotification; onAcknowledge: (notification: PartnerNotification, handoffAction?: "confirm-handoff" | "handoff-not-picked-up", deliveryReceived?: boolean) => void }) {
  const handoff = notification.actionKey.startsWith("confirm-handoff:");
  const delivery = notification.actionKey.startsWith("confirm-delivery:");
  const arrivedAt = Number(notification.actionKey.split(":")[2] ?? 0);
  const canReportMissing = handoff && arrivedAt > 0 && Date.now() - arrivedAt >= 15 * 60_000;
  return <section className="statusNotification"><strong>{notification.title}</strong><span>{notification.body}</span>{notification.actionRequired && !notification.acknowledgedAt && <div className="statusNotificationActions"><button onClick={() => onAcknowledge(notification, handoff ? "confirm-handoff" : undefined, delivery ? true : undefined)}>{notification.actionKey.startsWith("pickup-ready:") ? "Food is ready for pickup" : handoff ? "Confirm food was picked up" : delivery ? "Yes, it arrived" : "Acknowledge"}</button>{delivery && <button className="secondaryStatusAction" onClick={() => { if (window.confirm("Report that this delivery did not arrive? BakedBoston administrators will be notified.")) onAcknowledge(notification, undefined, false); }}>No, it did not arrive</button>}{canReportMissing && <button className="secondaryStatusAction" onClick={() => { if (window.confirm("Confirm that the driver has not picked up the food? BakedBoston administrators will be notified.")) onAcknowledge(notification, "handoff-not-picked-up"); }}>Food was not picked up</button>}</div>}</section>;
}

function formatOccurrenceWindow(occurrence: PickupOccurrence) {
  const options = { hour: "numeric", minute: "2-digit" } as const;
  return `${new Date(occurrence.pickupWindowStartsAt).toLocaleTimeString([], options)}–${new Date(occurrence.pickupDeadline).toLocaleTimeString([], options)}`;
}

function bakeryWindowForDate(organization: Organization, date: Date) {
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  try {
    const ready = JSON.parse(organization.readyTime ?? "{}") as Record<string, string>;
    const deadlines = JSON.parse(organization.arrivalDeadline ?? "{}") as Record<string, string>;
    return ready[day] && deadlines[day] ? { readyTime: ready[day], pickupDeadline: deadlines[day] } : null;
  } catch {
    if (!organization.recurringDays.split(",").map((value) => value.trim()).includes(day)) return null;
    return organization.readyTime && organization.arrivalDeadline
      ? { readyTime: organization.readyTime, pickupDeadline: organization.arrivalDeadline }
      : null;
  }
}

function ProfileEditor({ kind, organization, account, contacts: initialContacts, photos: initialPhotos, onSaved }: {
  kind: Kind; organization: Organization; account: Account; contacts: Contact[]; photos: AccessPhoto[]; onSaved: (message: string) => void;
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [photos, setPhotos] = useState(initialPhotos);
  const [photo, setPhoto] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [draft, setDraft] = useState({ name: "", email: "", phone: "" });
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/partner/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    onSaved(response.ok ? "Profile and contact information saved." : (data?.error ?? "Could not save profile."));
  }
  async function addContact() {
    const response = await fetch("/api/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setContacts((current) => [...current, data.record]);
      setDraft({ name: "", email: "", phone: "" });
      onSaved("Organizational contact added.");
    } else onSaved(data?.error ?? "Could not add contact.");
  }
  async function deleteContact(contact: Contact) {
    const response = await fetch(`/api/contacts?id=${contact.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setContacts((current) => current.filter((item) => item.id !== contact.id));
      onSaved("Organizational contact deleted.");
    } else onSaved(data?.error ?? "Could not delete contact.");
  }
  async function makePrimary(contact: Contact) {
    const response = await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: contact.id }) });
    const data = await response.json().catch(() => null);
    if (response.ok) { setContacts((current) => current.map((item) => ({ ...item, isPrimary: item.id === contact.id }))); onSaved(`${contact.name} is now the primary contact.`); }
    else onSaved(data?.error ?? "Could not change the primary contact.");
  }
  async function addPhoto() {
    if (!photo) return;
    const form = new FormData();
    form.set("photo", photo);
    form.set("caption", caption);
    const response = await fetch("/api/access-photos", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setPhotos((current) => [data.record, ...current]); setPhoto(null); setCaption("");
      onSaved(`${kind === "pantry" ? "Pantry" : "Bakery"} access photo added.`);
    } else onSaved(data?.error ?? "Could not upload photo.");
  }
  async function deletePhoto(id: number) {
    const response = await fetch(`/api/access-photos?id=${id}&organizationType=${kind}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    if (response.ok) { setPhotos((current) => current.filter((item) => item.id !== id)); onSaved(`${kind === "pantry" ? "Pantry" : "Bakery"} access photo deleted.`); }
    else onSaved(data?.error ?? "Could not delete photo.");
  }
  return <div className="profilePage">
    <div className="sectionIntro"><span className="panelKicker">ORGANIZATION SETTINGS</span><h2>Profile and contacts</h2><p>Keep operational details and organizational contacts current. The account email is used only to sign in; the primary contact is the person BakedBoston should contact first about the program.</p></div>
    <form className="profilePanel" onSubmit={save}>
      <fieldset className="profileSection"><legend>Login</legend>
        <label>Account email <small>Email address used to log in to this organization’s BakedBoston profile.</small><input name="accountEmail" type="email" required defaultValue={account.accountEmail} /></label>
      </fieldset>
      <fieldset><legend>Organization channels</legend>
        <label>{kind === "pantry" ? "Delivery address" : "Business address"}<input name="address" required defaultValue={organization.address} /></label>
        <label>{kind === "pantry" ? "Drop-off instructions" : "Pickup instructions"} <small>Help drivers find the exact {kind === "pantry" ? "receiving" : "pickup"} point after reaching the address.</small><textarea name="dropoffInstructions" rows={3} defaultValue={organization.dropoffInstructions ?? ""} placeholder={kind === "pantry" ? "Example: Community fridge is in the church parking lot" : "Example: Use the side entrance and ask at the pickup counter"} /></label>
        <label>Business phone number <small>Visible to drivers and partner organizations for calls during business hours.</small><input name="businessPhone" type="tel" defaultValue={organization.businessPhone} /></label>
        <label>Notification contact <small>Email address or phone number monitored for upcoming deliveries.</small><input name="notificationPhone" type="text" defaultValue={organization.notificationPhone} /></label>
      </fieldset>
      <fieldset><legend>{kind === "pantry" ? "Pantry" : "Bakery"} access photos <small>Optional</small></legend>
        <p>Post photos that help drivers locate the {kind === "pantry" ? "drop-off" : "pickup"} point.</p>
        {photos.length > 0 && <div className="pantryPhotoGrid">{photos.map((item) => <figure key={item.id}><img src={item.imageUrl} alt={item.caption || "Pantry access"} /><figcaption>{item.caption || "Pantry access photo"}</figcaption><button type="button" onClick={() => deletePhoto(item.id)}>Delete</button></figure>)}</div>}
        <div className="pantryPhotoUpload"><label>Photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></label><label>Caption<input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Example: Use the rear entrance" /></label><button type="button" disabled={!photo} onClick={addPhoto}>+ Add photo</button></div>
      </fieldset>
      <fieldset className="profileContacts"><legend>Organizational contacts</legend>
        <p>One contact is marked primary so BakedBoston knows whom to contact first. Add as many additional contacts as needed.</p>
        <div className="profileContactList">{contacts.map((contact) => <article className={contact.isPrimary ? "primaryContact" : ""} key={contact.id}><div><strong>{contact.isPrimary && <span className="primaryStar">★ PRIMARY</span>}{contact.name}</strong><small>{contact.email} · {contact.phone}</small></div><div>{!contact.isPrimary && <button type="button" onClick={() => makePrimary(contact)}>Make primary</button>}<button type="button" disabled={contacts.length <= 1} onClick={() => deleteContact(contact)}>Delete</button></div></article>)}</div>
        <div className="profileContactDraft"><input aria-label="Contact name" placeholder="Contact name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><input aria-label="Contact email" type="email" placeholder="Contact email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /><input aria-label="Contact phone" type="tel" placeholder="Contact phone number" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /><button type="button" disabled={!draft.name || !draft.email || !draft.phone} onClick={addContact}>+ Add contact</button></div>
      </fieldset>
      <div className="profileActions"><button>Save profile</button></div>
    </form>
    <PasswordPanel onSaved={onSaved} />
  </div>;
}

function ActivityCard({ activity, onAll }: { activity: Array<{ title: string; detail: string; status: string }>; onAll?: () => void }) {
  return <article className="activityPanel">
    <div className="panelHeading"><div><span className="panelKicker">RECENT ACTIVITY</span><h2>Delivery updates</h2></div>{onAll && <button onClick={onAll}>View all</button>}</div>
    {!activity.length ? <div className="emptyActivity"><strong>No deliveries yet</strong><p>Real delivery activity will appear here when routes are reserved or completed.</p></div> : activity.map((item) => <div className="activityRow" key={`${item.title}-${item.detail}`}><span className={item.status === "completed" ? "activityDot complete" : "activityDot"} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><b>{item.status}</b></div>)}
  </article>;
}

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const timeOptions = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
type ScheduleWindow = { recurrence: "weekly" | "monthly"; day: string; ordinal: number | null; open: string; close: string; latestArrival: string; serviceMode: "staffed" | "unattended"; businessOpen: string; businessClose: string; readyTime: string; pickupDeadline: string };

function ScheduleEditor({ kind, organization, onSaved, oneTimeWindows, scheduleExceptions, onWindowsChanged, onAddOneTime }: { kind: Kind; organization: Organization; onSaved: (message: string) => void; oneTimeWindows: OneTimeWindow[]; scheduleExceptions: ScheduleException[]; onWindowsChanged: () => Promise<void>; onAddOneTime: () => void }) {
  const bakery = kind === "bakery";
  const [rows, setRows] = useState<ScheduleWindow[]>(() => parseOrganizationSchedule(kind, organization));
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedOneTime, setSelectedOneTime] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/partner/schedule", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (data?.organization) setRows(parseOrganizationSchedule(kind, data.organization));
    }).catch(() => undefined);
  }, [kind]);
  const update = (index: number, patch: Partial<ScheduleWindow>) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  async function save() {
    setSaving(true);
    const response = await fetch("/api/partner/schedule", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ windows: rows }) });
    const data = await response.json().catch(() => null);
    setSaving(false);
    onSaved(response.ok ? "Schedule saved. BB administrators now see the same schedule." : (data?.error ?? "Could not save schedule."));
  }
  async function cancelOccurrence() {
    if (!selectedDate || !window.confirm(`Cancel scheduled hours on ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}? This affects only this date.`)) return;
    const response = await fetch("/api/partner/schedule-exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exceptionDate: selectedDate }) });
    const data = await response.json().catch(() => null);
    if (response.ok) { setSelected(null); setSelectedDate(null); await onWindowsChanged(); onSaved(`Scheduled hours cancelled for ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString()}.`); }
    else onSaved(data?.error ?? "Could not cancel scheduled hours.");
  }
  async function restoreOccurrence(exception: ScheduleException) {
    if (!window.confirm(`Restore the cancelled scheduled hours on ${new Date(`${exception.exceptionDate}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}?`)) return;
    const response = await fetch(`/api/partner/schedule-exceptions?id=${exception.id}`, { method: "DELETE" });
    if (response.ok) { await onWindowsChanged(); onSaved("Scheduled hours restored."); }
  }
  return <div className="schedulePage">
    <div className="sectionIntro"><span className="panelKicker">RECURRING AVAILABILITY</span><h2>{bakery ? "Pickup calendar" : "Receiving calendar"}</h2><p>View scheduled windows for the next four weeks. Select a window to edit, delete, or cancel only that date.</p></div>
    <div className="calendarToolbar"><button className="secondaryCalendarAction" onClick={onAddOneTime}>+ Add one-time {bakery ? "pickup" : "availability"} window</button><button onClick={() => { setRows((current) => [...current, emptyWindow()]); setSelected(rows.length); setSelectedDate(null); setSelectedOneTime(null); }}>+ Add recurring window</button></div>
    {selected !== null && rows[selected] && <article className="calendarWindowEditor"><div className="windowHeading"><div><span className="panelKicker">EDIT WINDOW</span><h3>{rows[selected].day} receiving window</h3></div><button onClick={() => setSelected(null)}>×</button></div>
      {!bakery && <label>Repeats<select value={rows[selected].recurrence} onChange={(event) => update(selected, { recurrence: event.target.value as "weekly" | "monthly", ordinal: event.target.value === "monthly" ? 1 : null })}><option value="weekly">Every week</option><option value="monthly">Once a month</option></select></label>}
      {!bakery && rows[selected].recurrence === "monthly" && <label>Occurrence<select value={rows[selected].ordinal ?? 1} onChange={(event) => update(selected, { ordinal: Number(event.target.value) })}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}{value === 1 ? "st" : value === 2 ? "nd" : value === 3 ? "rd" : "th"}</option>)}</select></label>}
      <label>Day<select value={rows[selected].day} onChange={(event) => update(selected, { day: event.target.value })}>{days.map((day) => <option key={day}>{day}</option>)}</select></label>
      {bakery ? <><TimeSelect label="Business opens" value={rows[selected].businessOpen} onChange={(value) => update(selected, { businessOpen: value })} /><TimeSelect label="Business closes" value={rows[selected].businessClose} onChange={(value) => update(selected, { businessClose: value })} /><TimeSelect label="Food ready" value={rows[selected].readyTime} onChange={(value) => update(selected, { readyTime: value })} /><TimeSelect label="Pickup deadline" value={rows[selected].pickupDeadline} onChange={(value) => update(selected, { pickupDeadline: value })} /></> : <><TimeSelect label="Opens" value={rows[selected].open} onChange={(value) => update(selected, { open: value })} /><TimeSelect label="Closes" value={rows[selected].close} onChange={(value) => update(selected, { close: value })} /><TimeSelect label="Latest permitted arrival" value={rows[selected].latestArrival} onChange={(value) => update(selected, { latestArrival: value })} /><ServiceModeSelect value={rows[selected].serviceMode} onChange={(serviceMode) => update(selected, { serviceMode })} /></>}
      <div className="calendarEditorActions"><button className="deleteWindow" disabled={rows.length <= 1} onClick={() => { setRows((current) => current.filter((_, index) => index !== selected)); setSelected(null); }}>Delete recurring window</button>{selectedDate && <button className="cancelOccurrence" onClick={cancelOccurrence}>Cancel scheduled hours on {new Date(`${selectedDate}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}</button>}<button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save schedule"}</button></div>
    </article>}
    {selectedOneTime !== null && oneTimeWindows.find((window) => window.id === selectedOneTime) && <OneTimeWindowEditor kind={kind} window={oneTimeWindows.find((item) => item.id === selectedOneTime)!} onClose={() => setSelectedOneTime(null)} onChanged={async () => { setSelectedOneTime(null); await onWindowsChanged(); }} onSaved={onSaved} />}
    <ReceivingCalendar kind={kind} rows={rows} oneTimeWindows={oneTimeWindows} scheduleExceptions={scheduleExceptions} onSelect={(index, date) => { setSelected(index); setSelectedDate(date); setSelectedOneTime(null); }} onSelectOneTime={(id) => { setSelectedOneTime(id); setSelected(null); }} onRestore={restoreOccurrence} />
    {selected === null && selectedOneTime === null && <div className="calendarSave"><button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save recurring schedule"}</button></div>}
  </div>;
}

function ReceivingCalendar({ kind, rows, oneTimeWindows, scheduleExceptions, onSelect, onSelectOneTime, onRestore }: { kind: Kind; rows: ScheduleWindow[]; oneTimeWindows: OneTimeWindow[]; scheduleExceptions: ScheduleException[]; onSelect: (index: number, date: string) => void; onSelectOneTime: (id: number) => void; onRestore: (exception: ScheduleException) => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const dates = Array.from({ length: 28 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  return <section className="monthlyReceivingCalendar"><div className="calendarMonthLabel"><strong>{today.toLocaleDateString([], { month: "long", year: "numeric" })}</strong><span>Next four weeks</span></div><header>{days.map((day) => <strong key={day}>{day}</strong>)}</header><div className="calendarMonthGrid">{dates.map((date) => {
    const day = days[(date.getDay() + 6) % 7]; const occurrence = Math.ceil(date.getDate() / 7);
    const exception = scheduleExceptions.find((item) => item.exceptionDate === localDate(date));
    const recurring = exception ? [] : rows.map((row, index) => ({ row, index })).filter(({ row }) => row.day === day && (row.recurrence === "weekly" || row.ordinal === occurrence));
    const dated = oneTimeWindows.filter((window) => sameLocalDate(new Date(window.startsAt), date));
    return <div className={`calendarDate ${sameLocalDate(date, today) ? "today" : ""}`} key={date.toISOString()}><span>{date.getDate()}</span>{exception && <button className="cancelledEvent" onClick={() => onRestore(exception)}><b>Scheduled hours cancelled</b><small>Click to restore</small></button>}{recurring.map(({ row, index }) => <button className="recurringEvent" key={`r-${index}`} onClick={() => onSelect(index, localDate(date))}><b>Recurring</b><small>{formatTime(kind === "bakery" ? row.readyTime : row.open)}–{formatTime(kind === "bakery" ? row.pickupDeadline : row.close)}</small>{kind === "pantry" && <><small>Latest {formatTime(row.latestArrival)}</small><small>{serviceModeLabel(row.serviceMode)}</small></>}</button>)}{dated.map((window) => <button className={`oneTimeEvent ${window.paused ? "paused" : ""}`} key={window.id} onClick={() => onSelectOneTime(window.id)}><b>{window.paused ? "One-time · Paused" : "One-time"}</b><small>{new Date(window.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{new Date(window.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>{kind === "pantry" && <><small>Latest {new Date(window.latestArrival).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small><small>{serviceModeLabel(window.serviceMode)}</small></>}</button>)}</div>;
  })}</div></section>;
}

function OneTimeWindowEditor({ kind, window, onClose, onChanged, onSaved }: { kind: Kind; window: OneTimeWindow; onClose: () => void; onChanged: () => Promise<void>; onSaved: (message: string) => void }) {
  const start = new Date(window.startsAt); const end = new Date(window.endsAt); const latest = new Date(window.latestArrival);
  const [draft, setDraft] = useState({ date: localDate(start), starts: localTime(start), ends: localTime(end), latest: localTime(latest), serviceMode: window.serviceMode ?? "staffed" });
  async function updateWindow() {
    const response = await fetch("/api/partner/availability", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: window.id, startsAt: localDateTime(draft.date, draft.starts), endsAt: localDateTime(draft.date, draft.ends), latestArrival: kind === "bakery" ? localDateTime(draft.date, draft.ends) : localDateTime(draft.date, draft.latest), serviceMode: kind === "bakery" ? "staffed" : draft.serviceMode }) });
    const data = await response.json().catch(() => null); if (response.ok) { await onChanged(); onSaved("One-time availability window updated."); } else onSaved(data?.error ?? "Could not update window.");
  }
  async function remove() { const response = await fetch(`/api/partner/availability?id=${window.id}`, { method: "DELETE" }); if (response.ok) { await onChanged(); onSaved("One-time availability window deleted."); } }
  return <article className="calendarWindowEditor"><div className="windowHeading"><div><span className="panelKicker">EDIT ONE-TIME WINDOW</span><h3>{new Date(window.startsAt).toLocaleDateString()}</h3></div><button onClick={onClose}>×</button></div><label>Date<input type="date" min={localDate(new Date())} value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></label><MinuteTimeInput label={kind === "bakery" ? "Food ready" : "Opens"} value={draft.starts} onChange={(value) => setDraft((current) => ({ ...current, starts: value }))} /><MinuteTimeInput label={kind === "bakery" ? "Pickup deadline" : "Closes"} value={draft.ends} onChange={(value) => setDraft((current) => ({ ...current, ends: value }))} />{kind === "pantry" && <><MinuteTimeInput label="Latest permitted arrival" value={draft.latest} onChange={(value) => setDraft((current) => ({ ...current, latest: value }))} /><ServiceModeSelect value={draft.serviceMode} onChange={(serviceMode) => setDraft((current) => ({ ...current, serviceMode }))} /></>}<div className="calendarEditorActions"><button className="deleteWindow" onClick={remove}>Delete window</button><button onClick={updateWindow}>Save changes</button></div></article>;
}

function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{timeOptions.map((time) => <option key={time} value={time}>{formatTime(time)}</option>)}</select></label>;
}
function MinuteTimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label>{label}<input type="time" step="60" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function ServiceModeSelect({ value, onChange }: { value: "staffed" | "unattended"; onChange: (value: "staffed" | "unattended") => void }) { return <label>Receiving method<select required value={value} onChange={(event) => onChange(event.target.value as "staffed" | "unattended")}><option value="staffed">Staffed — someone will receive deliveries</option><option value="unattended">Unattended — driver may leave food</option></select></label>; }
function serviceModeLabel(value: "staffed" | "unattended") { return value === "unattended" ? "Unattended drop-off" : "Staffed receiving"; }
function formatTime(value: string) { const [hour, minute] = value.split(":").map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`; }
function localDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function localTime(value: Date) { return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`; }
function localDateTime(date: string, time: string) { return new Date(`${date}T${time}:00`).toISOString(); }
function sameLocalDate(left: Date, right: Date) { return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate(); }
function emptyWindow(): ScheduleWindow { return { recurrence: "weekly", day: "Mon", ordinal: null, open: "09:00", close: "17:00", latestArrival: "16:30", serviceMode: "staffed", businessOpen: "07:00", businessClose: "18:00", readyTime: "15:00", pickupDeadline: "18:00" }; }
function parseOrganizationSchedule(kind: Kind, organization: Organization): ScheduleWindow[] {
  try {
    if (kind === "bakery") {
      const ready = JSON.parse(organization.readyTime ?? "{}") as Record<string, string>;
      const deadlines = JSON.parse(organization.arrivalDeadline ?? "{}") as Record<string, string>;
      const businessOpen = JSON.parse(organization.businessOpenTime ?? "{}") as Record<string, string>;
      const businessClose = JSON.parse(organization.businessCloseTime ?? "{}") as Record<string, string>;
      const rows = Object.keys(ready).map((day) => ({
        ...emptyWindow(), day,
        businessOpen: businessOpen[day] ?? ready[day],
        businessClose: businessClose[day] ?? deadlines[day],
        readyTime: ready[day], pickupDeadline: deadlines[day],
      }));
      return rows.length ? rows : [emptyWindow()];
    }
    const opens = JSON.parse(organization.openTime ?? "[]") as Array<{ recurrence: "weekly" | "monthly"; day: string; ordinal: number | null; time: string }>;
    const closes = JSON.parse(organization.closeTime ?? "[]") as Array<{ time: string }>;
    const latest = JSON.parse(organization.latestArrival ?? "[]") as Array<{ time: string }>;
    const modes = JSON.parse(organization.serviceModes ?? "[]") as Array<{ mode: "staffed" | "unattended" }>;
    const rows = opens.map((row, index) => ({ ...emptyWindow(), recurrence: row.recurrence, day: row.day, ordinal: row.ordinal, open: row.time, close: closes[index]?.time ?? "17:00", latestArrival: latest[index]?.time ?? "16:30", serviceMode: modes[index]?.mode ?? "staffed" }));
    return rows.length ? rows : [emptyWindow()];
  } catch { return [emptyWindow()]; }
}

function organizationIsOpen(kind: Kind, organization: Organization, now: Date) {
  const day = days[(now.getDay() + 6) % 7];
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const rows = parseOrganizationSchedule(kind, organization);
  return rows.some((row) => {
    if (row.day !== day) return false;
    if (row.recurrence === "monthly") {
      const occurrence = Math.ceil(now.getDate() / 7);
      if (occurrence !== (row.ordinal ?? 1)) return false;
    }
    return kind === "bakery" ? row.readyTime <= time && time <= row.pickupDeadline : row.open <= time && time <= row.latestArrival;
  });
}
function scheduledAvailabilityEnd(kind: Kind, organization: Organization, now: Date) {
  const day = days[(now.getDay() + 6) % 7];
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const row = parseOrganizationSchedule(kind, organization).find((window) => window.day === day && (kind === "bakery" ? window.readyTime <= time && time <= window.pickupDeadline : window.open <= time && time <= window.latestArrival));
  const endValue = (kind === "bakery" ? row?.pickupDeadline : row?.latestArrival ?? row?.close) ?? "23:59";
  const end = new Date(now); const [hour, minute] = endValue.split(":").map(Number); end.setHours(hour, minute, 0, 0); return end.toISOString();
}

function PasswordPanel({ onSaved }: { onSaved: (message: string) => void }) {
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [confirming, setConfirming] = useState(false);
  async function changePassword() {
    if (password !== confirmation) return onSaved("New passwords do not match.");
    const response = await fetch("/api/partner/password", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, confirmation }) });
    const data = await response.json().catch(() => null);
    if (response.ok) { setPassword(""); setConfirmation(""); setConfirming(false); onSaved("Password changed successfully."); }
    else onSaved(data?.error ?? "Could not change password.");
  }
  return <section className="securityPanel"><div><span className="panelKicker">SECURITY</span><h3>Change password</h3><p>Password changes are kept separate from ordinary profile edits.</p></div>{!confirming ? <button onClick={() => setConfirming(true)}>Change password</button> : <div className="passwordConfirmation"><label>New password<input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm new password<input type="password" minLength={10} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button disabled={password.length < 10 || confirmation.length < 10} onClick={changePassword}>Confirm password change</button><button className="cancelSecurity" onClick={() => setConfirming(false)}>Cancel</button></div>}</section>;
}
