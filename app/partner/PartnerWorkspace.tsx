"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "../availability-calendar.css";
import "../profile-layout.css";

type Kind = "bakery" | "pantry";
type Organization = {
  id: number; name: string; address: string; contactName: string; contactEmail: string;
  contactPhone: string; businessPhone: string; notificationPhone: string; dropoffInstructions?: string;
  recurringDays: string; readyTime?: string; arrivalDeadline?: string;
  openTime?: string; closeTime?: string; latestArrival?: string;
};
type Account = {
  id: number; accountEmail: string; administratorName: string; contactEmail: string;
  contactPhone: string;
};
type Contact = { id: number; name: string; email: string; phone: string; isPrimary: boolean };
type AccessPhoto = { id: number; imageUrl: string; pathname: string; caption: string };
type Route = { id: number; bakeryName: string; pantryName: string; driverName: string; scheduledArrival: string; status: "reserved" | "ongoing" | "completed"; createdAt: string | Date };
type OneTimeWindow = { id: number; startsAt: string; endsAt: string; latestArrival: string; paused: boolean };
type AvailabilityPause = { id: number; endsAt: string };
type ScheduleException = { id: number; exceptionDate: string };

export default function PartnerWorkspace({ kind, organization, account, contacts, photos = [], routes = [] }: {
  kind: Kind; organization: Organization; account: Account; contacts: Contact[]; photos?: AccessPhoto[]; routes?: Route[];
}) {
  const bakery = kind === "bakery";
  const [section, setSection] = useState<"overview" | "schedule" | "activity" | "profile">("overview");
  const [notice, setNotice] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [oneTimeWindows, setOneTimeWindows] = useState<OneTimeWindow[]>([]);
  const [availabilityPauses, setAvailabilityPauses] = useState<AvailabilityPause[]>([]);
  const [scheduleExceptions, setScheduleExceptions] = useState<ScheduleException[]>([]);
  const [availabilityDialog, setAvailabilityDialog] = useState(false);
  const [windowDraft, setWindowDraft] = useState({ date: "", starts: "", ends: "", latest: "" });
  const scheduledOpen = organizationIsOpen(kind, organization, new Date()) && !scheduleExceptions.some((exception) => exception.exceptionDate === localDate(new Date()));
  const schedulePaused = availabilityPauses.some((pause) => new Date(pause.endsAt) > new Date());
  const activeOneTime = oneTimeWindows.find((window) => !window.paused && new Date(window.startsAt) <= new Date() && new Date(window.endsAt) > new Date());
  const pausedOneTime = oneTimeWindows.find((window) => window.paused && new Date(window.startsAt) <= new Date() && new Date(window.endsAt) > new Date());
  const available = (scheduledOpen && !schedulePaused) || Boolean(activeOneTime);
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
  function showWindowDialog(useCurrentTime: boolean) {
    if (useCurrentTime && !window.confirm(`This will open ${organization.name} ${bakery ? "for pickup" : "to accept deliveries"} outside the saved recurring schedule. Continue?`)) return;
    const start = useCurrentTime ? new Date() : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const latest = new Date(end.getTime() - 15 * 60 * 1000);
    setWindowDraft({ date: localDate(start), starts: localTime(start), ends: localTime(end), latest: localTime(latest) });
    setAvailabilityDialog(true);
  }
  async function createOneTimeWindow() {
    const startsAt = localDateTime(windowDraft.date, windowDraft.starts);
    const endsAt = localDateTime(windowDraft.date, windowDraft.ends);
    const latestArrival = bakery ? endsAt : localDateTime(windowDraft.date, windowDraft.latest);
    const response = await fetch("/api/partner/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startsAt, endsAt, latestArrival }) });
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
      </nav>
      <div className="sideBottom"><span>{account.accountEmail}</span><button onClick={async () => { await fetch("/api/partner/session", { method: "DELETE" }); window.location.href = "/partners"; }}>Sign out</button></div>
    </aside>

    <section className="workspaceMain">
      <header className="workspaceHeader">
        <div><p>{bakery ? "BAKERY PARTNER" : "PANTRY PARTNER"}</p><h1>{section === "overview" ? "Good afternoon." : section === "schedule" ? (bakery ? "Pickup schedule" : "Receiving schedule") : section === "activity" ? "Delivery activity" : "Profile & contacts"}</h1></div>
        <div className="accountMenu"><button className="profileButton" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}>{(primaryContact?.name || organization.name).split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()} <span>⌄</span></button>{accountMenuOpen && <div className="accountDropdown"><strong>{organization.name}</strong><small>{account.accountEmail}</small><button onClick={() => { setSection("profile"); setAccountMenuOpen(false); }}>Profile & contacts</button><button onClick={async () => { await fetch("/api/partner/session", { method: "DELETE" }); window.location.href = "/partners"; }}>Sign out</button></div>}</div>
      </header>
      {notice && <div className="prototypeNotice">{notice}</div>}

      {section === "overview" && <>
        <div className="statusBanner">
          <div><span className={available ? "statusLight on" : "statusLight"} /><small>{available ? "AVAILABLE NOW" : "CLOSED NOW"}</small>
            <h2>{available ? (activeOneTime ? "Open for a one-time receiving window." : bakery ? "A scheduled pickup window is open." : "Open according to your receiving schedule.") : pausedOneTime || schedulePaused ? "Delivery availability is paused." : (bakery ? "No pickup window is open right now." : "Closed according to your receiving schedule.")}</h2>
            <p>{activeOneTime ? `${new Date(activeOneTime.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${new Date(activeOneTime.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · Latest arrival ${new Date(activeOneTime.latestArrival).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : pausedOneTime ? `One-time window paused · scheduled to end ${new Date(pausedOneTime.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : schedulePaused ? "The current recurring window is paused." : available ? "Availability is based on the saved organization schedule." : "You can create a one-time receiving window if the pantry can accept deliveries."}</p></div>
          {activeOneTime && <button onClick={() => setOneTimePaused(activeOneTime, true)}>Pause availability</button>}
          {pausedOneTime && <button onClick={() => setOneTimePaused(pausedOneTime, false)}>Resume availability</button>}
          {scheduledOpen && !schedulePaused && !activeOneTime && !pausedOneTime && <button onClick={pauseSchedule}>Pause availability</button>}
          {scheduledOpen && schedulePaused && !activeOneTime && !pausedOneTime && <button onClick={resumeSchedule}>Resume availability</button>}
          {!scheduledOpen && !activeOneTime && !pausedOneTime && <button onClick={() => showWindowDialog(true)}>{bakery ? "Start pickup window" : "Open to accept deliveries"}</button>}
        </div>
        <div className="workspaceGrid singleActivity"><ActivityCard activity={activity.slice(0, 3)} onAll={() => setSection("activity")} /></div>
      </>}

      {section === "schedule" && <ScheduleEditor kind={kind} organization={organization} onSaved={prototypeAction} oneTimeWindows={oneTimeWindows} scheduleExceptions={scheduleExceptions} onWindowsChanged={refreshAvailability} onAddOneTime={() => showWindowDialog(false)} />}
      {section === "activity" && <div className="activityPage"><div className="sectionIntro"><span className="panelKicker">DELIVERY HISTORY</span><h2>{bakery ? "Your pickups" : "Your deliveries"}</h2><p>Reserved, ongoing, and completed deliveries will appear here automatically.</p></div><ActivityCard activity={activity} /></div>}
      {section === "profile" && <ProfileEditor kind={kind} organization={organization} account={account} contacts={contacts} photos={photos} onSaved={(message) => prototypeAction(message)} />}
    </section>
    {availabilityDialog && <div className="availabilityBackdrop"><section className="availabilityDialog"><span className="panelKicker">ONE-TIME AVAILABILITY</span><h2>{bakery ? "Add a pickup window" : "Add a receiving window"}</h2><p>This creates a single dated window and does not change the recurring schedule.</p><label>Date<input type="date" min={localDate(new Date())} value={windowDraft.date} onChange={(event) => setWindowDraft((current) => ({ ...current, date: event.target.value }))} /></label><MinuteTimeInput label={bakery ? "Food ready" : "Opens"} value={windowDraft.starts} onChange={(value) => setWindowDraft((current) => ({ ...current, starts: value }))} /><MinuteTimeInput label={bakery ? "Pickup deadline" : "Closes"} value={windowDraft.ends} onChange={(value) => setWindowDraft((current) => ({ ...current, ends: value }))} />{!bakery && <MinuteTimeInput label="Latest permitted arrival" value={windowDraft.latest} onChange={(value) => setWindowDraft((current) => ({ ...current, latest: value }))} />}<div><button onClick={() => setAvailabilityDialog(false)}>Cancel</button><button className="confirmAvailability" onClick={createOneTimeWindow}>Confirm availability</button></div></section></div>}
  </main>;
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
type ScheduleWindow = { recurrence: "weekly" | "monthly"; day: string; ordinal: number | null; open: string; close: string; latestArrival: string; readyTime: string; pickupDeadline: string };

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
      {bakery ? <><TimeSelect label="Food ready" value={rows[selected].readyTime} onChange={(value) => update(selected, { readyTime: value })} /><TimeSelect label="Pickup deadline" value={rows[selected].pickupDeadline} onChange={(value) => update(selected, { pickupDeadline: value })} /></> : <><TimeSelect label="Opens" value={rows[selected].open} onChange={(value) => update(selected, { open: value })} /><TimeSelect label="Closes" value={rows[selected].close} onChange={(value) => update(selected, { close: value })} /><TimeSelect label="Latest permitted arrival" value={rows[selected].latestArrival} onChange={(value) => update(selected, { latestArrival: value })} /></>}
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
    return <div className={`calendarDate ${sameLocalDate(date, today) ? "today" : ""}`} key={date.toISOString()}><span>{date.getDate()}</span>{exception && <button className="cancelledEvent" onClick={() => onRestore(exception)}><b>Scheduled hours cancelled</b><small>Click to restore</small></button>}{recurring.map(({ row, index }) => <button className="recurringEvent" key={`r-${index}`} onClick={() => onSelect(index, localDate(date))}><b>Recurring</b><small>{formatTime(kind === "bakery" ? row.readyTime : row.open)}–{formatTime(kind === "bakery" ? row.pickupDeadline : row.close)}</small>{kind === "pantry" && <small>Latest {formatTime(row.latestArrival)}</small>}</button>)}{dated.map((window) => <button className={`oneTimeEvent ${window.paused ? "paused" : ""}`} key={window.id} onClick={() => onSelectOneTime(window.id)}><b>{window.paused ? "One-time · Paused" : "One-time"}</b><small>{new Date(window.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{new Date(window.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>{kind === "pantry" && <small>Latest {new Date(window.latestArrival).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>}</button>)}</div>;
  })}</div></section>;
}

function OneTimeWindowEditor({ kind, window, onClose, onChanged, onSaved }: { kind: Kind; window: OneTimeWindow; onClose: () => void; onChanged: () => Promise<void>; onSaved: (message: string) => void }) {
  const start = new Date(window.startsAt); const end = new Date(window.endsAt); const latest = new Date(window.latestArrival);
  const [draft, setDraft] = useState({ date: localDate(start), starts: localTime(start), ends: localTime(end), latest: localTime(latest) });
  async function updateWindow() {
    const response = await fetch("/api/partner/availability", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: window.id, startsAt: localDateTime(draft.date, draft.starts), endsAt: localDateTime(draft.date, draft.ends), latestArrival: kind === "bakery" ? localDateTime(draft.date, draft.ends) : localDateTime(draft.date, draft.latest) }) });
    const data = await response.json().catch(() => null); if (response.ok) { await onChanged(); onSaved("One-time availability window updated."); } else onSaved(data?.error ?? "Could not update window.");
  }
  async function remove() { const response = await fetch(`/api/partner/availability?id=${window.id}`, { method: "DELETE" }); if (response.ok) { await onChanged(); onSaved("One-time availability window deleted."); } }
  return <article className="calendarWindowEditor"><div className="windowHeading"><div><span className="panelKicker">EDIT ONE-TIME WINDOW</span><h3>{new Date(window.startsAt).toLocaleDateString()}</h3></div><button onClick={onClose}>×</button></div><label>Date<input type="date" min={localDate(new Date())} value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></label><MinuteTimeInput label={kind === "bakery" ? "Food ready" : "Opens"} value={draft.starts} onChange={(value) => setDraft((current) => ({ ...current, starts: value }))} /><MinuteTimeInput label={kind === "bakery" ? "Pickup deadline" : "Closes"} value={draft.ends} onChange={(value) => setDraft((current) => ({ ...current, ends: value }))} />{kind === "pantry" && <MinuteTimeInput label="Latest permitted arrival" value={draft.latest} onChange={(value) => setDraft((current) => ({ ...current, latest: value }))} />}<div className="calendarEditorActions"><button className="deleteWindow" onClick={remove}>Delete window</button><button onClick={updateWindow}>Save changes</button></div></article>;
}

function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{timeOptions.map((time) => <option key={time} value={time}>{formatTime(time)}</option>)}</select></label>;
}
function MinuteTimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label>{label}<input type="time" step="60" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function formatTime(value: string) { const [hour, minute] = value.split(":").map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`; }
function localDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function localTime(value: Date) { return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`; }
function localDateTime(date: string, time: string) { return new Date(`${date}T${time}:00`).toISOString(); }
function sameLocalDate(left: Date, right: Date) { return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate(); }
function emptyWindow(): ScheduleWindow { return { recurrence: "weekly", day: "Mon", ordinal: null, open: "09:00", close: "17:00", latestArrival: "16:30", readyTime: "15:00", pickupDeadline: "18:00" }; }
function parseOrganizationSchedule(kind: Kind, organization: Organization): ScheduleWindow[] {
  try {
    if (kind === "bakery") {
      const ready = JSON.parse(organization.readyTime ?? "{}") as Record<string, string>;
      const deadlines = JSON.parse(organization.arrivalDeadline ?? "{}") as Record<string, string>;
      const rows = Object.keys(ready).map((day) => ({ ...emptyWindow(), day, readyTime: ready[day], pickupDeadline: deadlines[day] }));
      return rows.length ? rows : [emptyWindow()];
    }
    const opens = JSON.parse(organization.openTime ?? "[]") as Array<{ recurrence: "weekly" | "monthly"; day: string; ordinal: number | null; time: string }>;
    const closes = JSON.parse(organization.closeTime ?? "[]") as Array<{ time: string }>;
    const latest = JSON.parse(organization.latestArrival ?? "[]") as Array<{ time: string }>;
    const rows = opens.map((row, index) => ({ ...emptyWindow(), recurrence: row.recurrence, day: row.day, ordinal: row.ordinal, open: row.time, close: closes[index]?.time ?? "17:00", latestArrival: latest[index]?.time ?? "16:30" }));
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
