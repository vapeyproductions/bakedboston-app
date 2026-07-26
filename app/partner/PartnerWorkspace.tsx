"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function PartnerWorkspace({ kind, organization, account, contacts, photos = [] }: {
  kind: Kind; organization: Organization; account: Account; contacts: Contact[]; photos?: AccessPhoto[];
}) {
  const bakery = kind === "bakery";
  const [section, setSection] = useState<"overview" | "schedule" | "activity" | "profile">("overview");
  const [notice, setNotice] = useState("");
  const [available, setAvailable] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const activity = bakery ? bakeryActivity : pantryActivity;
  const primaryContact = contacts.find((contact) => contact.isPrimary) ?? contacts[0];

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
        <button className={section === "schedule" ? "active" : ""} onClick={() => setSection("schedule")}><span>◷</span> {bakery ? "Pickup schedule" : "Receiving schedule"}</button>
        <button className={section === "activity" ? "active" : ""} onClick={() => setSection("activity")}><span>↗</span> Delivery activity</button>
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

      {section === "schedule" && <ScheduleEditor kind={kind} organization={organization} onSaved={prototypeAction} />}
      {section === "activity" && <div className="activityPage"><div className="sectionIntro"><span className="panelKicker">RESCUE HISTORY</span><h2>{bakery ? "Your pickups" : "Your deliveries"}</h2><p>Reserved, ongoing, and completed rescues will appear here automatically.</p></div><ActivityCard activity={activity} /></div>}
      {section === "profile" && <ProfileEditor kind={kind} organization={organization} account={account} contacts={contacts} photos={photos} onSaved={(message) => prototypeAction(message)} />}
    </section>
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
        <label>Business phone number <small>Visible to drivers and rescue partners for calls during business hours.</small><input name="businessPhone" type="tel" defaultValue={organization.businessPhone} /></label>
        <label>Notification contact <small>Email address or phone number monitored for upcoming deliveries.</small><input name="notificationPhone" type="text" defaultValue={organization.notificationPhone} /></label>
      </fieldset>
      <fieldset><legend>{kind === "pantry" ? "Pantry" : "Bakery"} access photos <small>Optional</small></legend>
        <p>Post photos that help drivers locate the {kind === "pantry" ? "drop-off" : "pickup"} point. Photos are not included in the onboarding email.</p>
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

function ActivityCard({ activity, onAll }: { activity: typeof bakeryActivity; onAll?: () => void }) {
  return <article className="activityPanel">
    <div className="panelHeading"><div><span className="panelKicker">RECENT ACTIVITY</span><h2>Rescue updates</h2></div>{onAll && <button onClick={onAll}>View all</button>}</div>
    {activity.map((item) => <div className="activityRow" key={`${item.title}-${item.detail}`}><span className={item.status === "Completed" ? "activityDot complete" : "activityDot"} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><b>{item.status}</b></div>)}
  </article>;
}

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const timeOptions = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
type ScheduleWindow = { recurrence: "weekly" | "monthly"; day: string; ordinal: number | null; open: string; close: string; latestArrival: string; readyTime: string; pickupDeadline: string };

function ScheduleEditor({ kind, organization, onSaved }: { kind: Kind; organization: Organization; onSaved: (message: string) => void }) {
  const bakery = kind === "bakery";
  const [rows, setRows] = useState<ScheduleWindow[]>(() => parseOrganizationSchedule(kind, organization));
  const [saving, setSaving] = useState(false);
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
  return <div className="schedulePage">
    <div className="sectionIntro"><span className="panelKicker">RECURRING AVAILABILITY</span><h2>{bakery ? "When is surplus ready?" : "When can you receive?"}</h2><p>{bakery ? "Each day may have its own food-ready time and pickup deadline." : "Use multiple daily windows or monthly rules such as the second Saturday."}</p></div>
    <article className="schedulePanel scheduleEditorPanel">
      {rows.map((row, index) => <div className="partnerScheduleRow" key={index}><div className="windowHeading"><strong>{bakery ? "Pickup day" : "Receiving window"} {index + 1}</strong>{rows.length > 1 && <button onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>}</div>
        {!bakery && <label>Repeats<select value={row.recurrence} onChange={(event) => update(index, { recurrence: event.target.value as "weekly" | "monthly", ordinal: event.target.value === "monthly" ? 1 : null })}><option value="weekly">Every week</option><option value="monthly">Once a month</option></select></label>}
        {!bakery && row.recurrence === "monthly" && <label>Occurrence<select value={row.ordinal ?? 1} onChange={(event) => update(index, { ordinal: Number(event.target.value) })}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}{value === 1 ? "st" : value === 2 ? "nd" : value === 3 ? "rd" : "th"}</option>)}</select></label>}
        <label>Day<select value={row.day} onChange={(event) => update(index, { day: event.target.value })}>{days.map((day) => <option key={day}>{day}</option>)}</select></label>
        {bakery ? <><TimeSelect label="Food ready" value={row.readyTime} onChange={(value) => update(index, { readyTime: value })} /><TimeSelect label="Pickup deadline" value={row.pickupDeadline} onChange={(value) => update(index, { pickupDeadline: value })} /></> : <><TimeSelect label="Opens" value={row.open} onChange={(value) => update(index, { open: value })} /><TimeSelect label="Closes" value={row.close} onChange={(value) => update(index, { close: value })} /><TimeSelect label="Latest permitted arrival" value={row.latestArrival} onChange={(value) => update(index, { latestArrival: value })} /></>}
      </div>)}
      <button className="addWindow" onClick={() => setRows((current) => [...current, emptyWindow()])}>+ Add {bakery ? "pickup day" : "receiving window"}</button>
      <div className="scheduleActions"><button disabled={saving} onClick={save}>{saving ? "Saving…" : "Save schedule"}</button></div>
    </article>
  </div>;
}

function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{timeOptions.map((time) => <option key={time} value={time}>{formatTime(time)}</option>)}</select></label>;
}
function formatTime(value: string) { const [hour, minute] = value.split(":").map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`; }
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
