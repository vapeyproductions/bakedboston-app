"use client";

import { useState } from "react";
import Link from "next/link";

type Kind = "bakery" | "pantry";
type Organization = {
  id: number; name: string; address: string; contactName: string; contactEmail: string;
  contactPhone: string; businessPhone: string; notificationPhone: string; dropoffInstructions?: string;
};
type Account = {
  id: number; accountEmail: string; administratorName: string; contactEmail: string;
  contactPhone: string;
};
type Contact = { id: number; name: string; email: string; phone: string };
type PantryAccessPhoto = { id: number; pantryId: number; imageUrl: string; pathname: string; caption: string };

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
  kind: Kind; organization: Organization; account: Account; contacts: Contact[]; photos?: PantryAccessPhoto[];
}) {
  const bakery = kind === "bakery";
  const [section, setSection] = useState<"overview" | "schedule" | "activity" | "profile">("overview");
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
        <div><small>{bakery ? "BAKERY" : "PANTRY"} WORKSPACE</small><strong>{organization.name}</strong></div>
      </div>
      <nav className="workspaceTabs">
        <button className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}><span>⌂</span> Overview</button>
        <button className={section === "schedule" ? "active" : ""} onClick={() => setSection("schedule")}><span>◷</span> {bakery ? "Pickup schedule" : "Receiving schedule"}</button>
        <button className={section === "activity" ? "active" : ""} onClick={() => setSection("activity")}><span>↗</span> Delivery activity</button>
        <button className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}><span>⚙</span> Profile & contacts</button>
      </nav>
      <div className="sideBottom"><span>{account.administratorName}</span><button onClick={async () => { await fetch("/api/partner/session", { method: "DELETE" }); window.location.href = "/partners"; }}>Sign out</button></div>
    </aside>

    <section className="workspaceMain">
      <header className="workspaceHeader">
        <div><p>{bakery ? "BAKERY PARTNER" : "PANTRY PARTNER"}</p><h1>{section === "overview" ? "Good afternoon." : section === "schedule" ? (bakery ? "Pickup schedule" : "Receiving schedule") : section === "activity" ? "Delivery activity" : "Profile & contacts"}</h1></div>
        <button className="profileButton" onClick={() => setSection("profile")}>{account.administratorName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()} <span>⌄</span></button>
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
      {section === "profile" && <ProfileEditor kind={kind} organization={organization} account={account} contacts={contacts} photos={photos} onSaved={(message) => prototypeAction(message)} />}
    </section>
  </main>;
}

function ProfileEditor({ kind, organization, account, contacts: initialContacts, photos: initialPhotos, onSaved }: {
  kind: Kind; organization: Organization; account: Account; contacts: Contact[]; photos: PantryAccessPhoto[]; onSaved: (message: string) => void;
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
      onSaved("Primary organizational contact added.");
    } else onSaved(data?.error ?? "Could not add contact.");
  }
  async function deleteContact(contact: Contact) {
    const response = await fetch(`/api/contacts?id=${contact.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setContacts((current) => current.filter((item) => item.id !== contact.id));
      onSaved("Primary organizational contact deleted.");
    } else onSaved(data?.error ?? "Could not delete contact.");
  }
  async function addPhoto() {
    if (!photo) return;
    const form = new FormData();
    form.set("photo", photo);
    form.set("caption", caption);
    const response = await fetch("/api/pantry-photos", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setPhotos((current) => [data.record, ...current]); setPhoto(null); setCaption("");
      onSaved("Pantry access photo added.");
    } else onSaved(data?.error ?? "Could not upload photo.");
  }
  async function deletePhoto(id: number) {
    const response = await fetch(`/api/pantry-photos?id=${id}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    if (response.ok) { setPhotos((current) => current.filter((item) => item.id !== id)); onSaved("Pantry access photo deleted."); }
    else onSaved(data?.error ?? "Could not delete photo.");
  }
  return <div className="profilePage">
    <div className="sectionIntro"><span className="panelKicker">ORGANIZATION SETTINGS</span><h2>Account and contact channels</h2><p>Account credentials are private. Public business details are available to rescue partners; notification details are used for delivery confirmations; administrator contact details are for one-to-one operational support.</p></div>
    <form className="profilePanel" onSubmit={save}>
      <fieldset><legend>Private account</legend>
        <label>Account email <small>Email address used to log in to this organization’s BakedBoston profile.</small><input name="accountEmail" type="email" required defaultValue={account.accountEmail} /></label>
        <label>New password <input name="newPassword" type="password" minLength={10} placeholder="Leave blank to keep current password" /></label>
      </fieldset>
      <fieldset><legend>Organization channels</legend>
        <label>{kind === "pantry" ? "Delivery address" : "Business address"}<input name="address" required defaultValue={organization.address} /></label>
        {kind === "pantry" && <label>Drop-off instructions <small>Help drivers find the exact receiving point after they reach the delivery address.</small><textarea name="dropoffInstructions" rows={3} defaultValue={organization.dropoffInstructions ?? ""} placeholder="Example: Community fridge is in the church parking lot" /></label>}
        <label>Business phone number <small>Visible to drivers and rescue partners for calls during business hours.</small><input name="businessPhone" type="tel" defaultValue={organization.businessPhone} /></label>
        <label>Notification contact <small>Email address or phone number monitored for upcoming deliveries.</small><input name="notificationPhone" type="text" defaultValue={organization.notificationPhone} /></label>
      </fieldset>
      {kind === "pantry" && <fieldset><legend>Pantry access photos <small>Optional</small></legend>
        <p>Post photos that help drivers locate the drop-off point. Photos are not included in the onboarding email.</p>
        {photos.length > 0 && <div className="pantryPhotoGrid">{photos.map((item) => <figure key={item.id}><img src={item.imageUrl} alt={item.caption || "Pantry access"} /><figcaption>{item.caption || "Pantry access photo"}</figcaption><button type="button" onClick={() => deletePhoto(item.id)}>Delete</button></figure>)}</div>}
        <div className="pantryPhotoUpload"><label>Photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></label><label>Caption<input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Example: Use the rear entrance" /></label><button type="button" disabled={!photo} onClick={addPhoto}>+ Add photo</button></div>
      </fieldset>}
      <fieldset className="profileContacts"><legend>Primary organizational contacts</legend>
        <p>At least one primary contact must remain on the organization.</p>
        <div className="profileContactList">{contacts.map((contact) => <article key={contact.id}><div><strong>{contact.name}</strong><small>{contact.email} · {contact.phone}</small></div><button type="button" disabled={contacts.length <= 1} onClick={() => deleteContact(contact)}>Delete</button></article>)}</div>
        <div className="profileContactDraft"><input aria-label="Contact name" placeholder="Contact name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><input aria-label="Contact email" type="email" placeholder="Contact email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /><input aria-label="Contact phone" type="tel" placeholder="Contact phone number" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /><button type="button" disabled={!draft.name || !draft.email || !draft.phone} onClick={addContact}>+ Add contact</button></div>
      </fieldset>
      <fieldset><legend>Your account administrator contact</legend>
        <label>Administrator name<input name="administratorName" required defaultValue={account.administratorName} /></label>
        <label>Contact email<input name="contactEmail" type="email" required defaultValue={account.contactEmail} /></label>
        <label>Contact phone<input name="contactPhone" type="tel" required defaultValue={account.contactPhone} /></label>
      </fieldset>
      <div className="profileActions"><button>Save profile</button></div>
    </form>
  </div>;
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
