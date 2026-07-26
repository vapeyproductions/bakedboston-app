"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import "./admin.css";

type Bakery = {
  id: number; name: string; address: string; recurringDays: string; readyTime: string;
  arrivalDeadline: string; active: boolean; latitude: number | null; longitude: number | null;
  contactName: string; contactEmail: string; contactPhone: string;
};
type Pantry = {
  id: number; name: string; address: string; recurringDays: string; openTime: string;
  closeTime: string; latestArrival: string; deliveriesSevenDays: number; active: boolean;
  latitude: number | null; longitude: number | null; contactName: string; contactEmail: string;
  contactPhone: string;
};
type PartnerKind = "bakery" | "pantry";
type Partner = Bakery | Pantry;
type DayHours = { open: string; close: string; latestArrival: string };
type ReceivingWindow = DayHours & {
  recurrence: "weekly" | "monthly";
  day: string;
  ordinal: number | null;
};
type BakeryDayHours = { readyTime: string; pickupDeadline: string };
type BakerySchedule = Partial<Record<string, BakeryDayHours>>;
type Route = {
  id: number; bakeryName: string; pantryName: string; driverName: string;
  scheduledArrival: string; status: "reserved" | "ongoing" | "completed";
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseSchedule(pantry: Pantry): ReceivingWindow[] {
  try {
    const open = JSON.parse(pantry.openTime) as Record<string, string> | Array<{ recurrence: "weekly" | "monthly"; day: string; ordinal: number | null; time: string }>;
    const close = JSON.parse(pantry.closeTime) as Record<string, string> | Array<{ time: string }>;
    const latest = JSON.parse(pantry.latestArrival) as Record<string, string> | Array<{ time: string }>;
    if (Array.isArray(open) && Array.isArray(close) && Array.isArray(latest)) {
      return open.map((window, index) => ({
        recurrence: window.recurrence,
        day: window.day,
        ordinal: window.ordinal,
        open: window.time,
        close: close[index]?.time ?? "",
        latestArrival: latest[index]?.time ?? "",
      }));
    }
    const legacyOpen = open as Record<string, string>;
    return Object.keys(legacyOpen).map((day) => ({
      recurrence: "weekly" as const, day, ordinal: null,
      open: legacyOpen[day], close: (close as Record<string, string>)[day],
      latestArrival: (latest as Record<string, string>)[day],
    }));
  } catch {
    return pantry.recurringDays.split(",").map((day) => ({
      recurrence: "weekly" as const, day: day.trim(), ordinal: null,
      open: pantry.openTime, close: pantry.closeTime, latestArrival: pantry.latestArrival,
    }));
  }
}

function parseBakerySchedule(bakery: Bakery): BakerySchedule {
  try {
    const ready = JSON.parse(bakery.readyTime) as Record<string, string>;
    const deadline = JSON.parse(bakery.arrivalDeadline) as Record<string, string>;
    return Object.fromEntries(Object.keys(ready).map((day) => [day, {
      readyTime: ready[day],
      pickupDeadline: deadline[day],
    }]));
  } catch {
    return Object.fromEntries(bakery.recurringDays.split(",").map((day) => [day.trim(), {
      readyTime: bakery.readyTime,
      pickupDeadline: bakery.arrivalDeadline,
    }]));
  }
}

function formatTime(value: string) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
    .format(new Date(2000, 0, 1, hours, minutes));
}

const ordinalLabels = ["", "1st", "2nd", "3rd", "4th", "5th"];

function describeWindow(window: ReceivingWindow) {
  return window.recurrence === "monthly"
    ? `${ordinalLabels[window.ordinal ?? 1]} ${window.day} monthly`
    : `Every ${window.day}`;
}

export default function AdminDashboard({ user }: { user: { name: string; email: string } }) {
  const [tab, setTab] = useState<"overview" | "bakeries" | "pantries" | "routes">("overview");
  const [bakeries, setBakeries] = useState<Bakery[]>([]);
  const [pantries, setPantries] = useState<Pantry[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ kind: PartnerKind; record?: Partner } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    const response = await fetch("/api/admin");
    if (response.ok) {
      const data = await response.json();
      setBakeries(data.bakeries);
      setPantries(data.pantries);
      setRoutes(data.routes);
    }
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const completed = routes.filter((route) => route.status === "completed").length;
  const activeRoutes = routes.filter((route) => route.status !== "completed").length;

  const averagePriority = useMemo(() => {
    if (!pantries.length) return "—";
    const avg = pantries.reduce((sum, pantry) => sum + 1 / (1 + pantry.deliveriesSevenDays), 0) / pantries.length;
    return avg.toFixed(2);
  }, [pantries]);

  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.kind = modal?.kind ?? "";
    if (modal?.record) payload.id = String(modal.record.id);
    const response = await fetch("/api/admin", {
      method: modal?.record ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      setNotice(`${modal?.kind === "bakery" ? "Bakery" : "Pantry"} ${modal?.record ? "updated" : "saved"}.`);
      setModal(null);
      await refresh();
    } else {
      const data = await response.json().catch(() => null);
      setNotice(data?.error ?? `Could not save this record (${response.status}).`);
    }
    setSaving(false);
  };

  const deleteRecord = async (kind: PartnerKind, record: Partner) => {
    if (!window.confirm(`Delete ${record.name}? This cannot be undone.`)) return;
    setDeletingId(record.id);
    setNotice("");
    const response = await fetch(`/api/admin?kind=${kind}&id=${record.id}`, { method: "DELETE" });
    if (response.ok) {
      setNotice(`${kind === "bakery" ? "Bakery" : "Pantry"} deleted.`);
      await refresh();
    } else {
      const data = await response.json().catch(() => null);
      setNotice(data?.error ?? `Could not delete this record (${response.status}).`);
    }
    setDeletingId(null);
  };

  return (
    <main className="adminShell">
      <aside className="adminSidebar">
        <a className="adminBrand" href="/"><span>B</span><strong>BakedBoston</strong></a>
        <p className="workspaceLabel">ADMIN WORKSPACE</p>
        <nav>
          {(["overview", "bakeries", "pantries", "routes"] as const).map((item) => (
            <button className={tab === item ? "selected" : ""} key={item} onClick={() => setTab(item)}>
              <i>{item === "overview" ? "⌂" : item === "bakeries" ? "B" : item === "pantries" ? "P" : "↗"}</i>
              {item}
              {item === "bakeries" && <small>{bakeries.length}</small>}
              {item === "pantries" && <small>{pantries.length}</small>}
            </button>
          ))}
        </nav>
        <div className="adminUser">
          <span>{user.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{user.name}</strong><small>Administrator</small></div>
          <a href="/" title="Return to site">↗</a>
        </div>
      </aside>

      <section className="adminMain">
        <header className="adminHeader">
          <div><p>BAKEDBOSTON NETWORK</p><h1>{tab === "overview" ? "Good evening." : tab}</h1></div>
          <div className="headerActions">
            {notice && <span className="notice">{notice}</span>}
            <button className="outlineBtn" onClick={() => setModal({ kind: "pantry" })}>+ Add pantry</button>
            <button className="solidBtn" onClick={() => setModal({ kind: "bakery" })}>+ Add bakery</button>
          </div>
        </header>

        {loading ? <div className="adminEmpty">Loading your network…</div> : (
          <>
            {tab === "overview" && <Overview bakeries={bakeries} pantries={pantries} routes={routes} completed={completed} activeRoutes={activeRoutes} averagePriority={averagePriority} />}
            {tab === "bakeries" && <PartnerTable type="bakery" records={bakeries} onAdd={() => setModal({ kind: "bakery" })} onEdit={(record) => setModal({ kind: "bakery", record })} onDelete={deleteRecord} deletingId={deletingId} />}
            {tab === "pantries" && <PartnerTable type="pantry" records={pantries} onAdd={() => setModal({ kind: "pantry" })} onEdit={(record) => setModal({ kind: "pantry", record })} onDelete={deleteRecord} deletingId={deletingId} />}
            {tab === "routes" && <RoutesTable routes={routes} />}
          </>
        )}
      </section>

      {modal && <RecordModal kind={modal.kind} record={modal.record} saving={saving} onClose={() => setModal(null)} onSave={saveRecord} />}
    </main>
  );
}

function Overview({ bakeries, pantries, routes, completed, activeRoutes, averagePriority }: {
  bakeries: Bakery[]; pantries: Pantry[]; routes: Route[]; completed: number; activeRoutes: number; averagePriority: string;
}) {
  return <>
    <div className="metricGrid">
      <article><span>PARTNER BAKERIES</span><strong>{bakeries.length}</strong><small>{bakeries.length ? "Approved network" : "Ready for onboarding"}</small></article>
      <article><span>PARTNER PANTRIES</span><strong>{pantries.length}</strong><small>Average priority {averagePriority}</small></article>
      <article><span>ACTIVE ROUTES</span><strong>{activeRoutes}</strong><small>Reserved + ongoing</small></article>
      <article className="coralMetric"><span>COMPLETED RESCUES</span><strong>{completed}</strong><small>All-time total</small></article>
    </div>
    <div className="overviewGrid">
      <article className="panel">
        <div className="panelTitle"><div><span>ROUTE ACTIVITY</span><h2>Today’s rescue board</h2></div><i className="liveDot">LIVE</i></div>
        {routes.length ? <RoutesTable routes={routes.slice(0, 5)} compact /> : <Empty title="No routes yet" body="Reserved, ongoing, and completed routes will appear here automatically." />}
      </article>
      <article className="panel onboarding">
        <div className="panelTitle"><div><span>PARTNER SETUP</span><h2>Onboarding progress</h2></div></div>
        <Progress label="Bakery profiles" value={bakeries.length} target={5} color="#ef6548" />
        <Progress label="Pantry profiles" value={pantries.length} target={5} color="#f4bf43" />
        <div className="tip"><b>Next step</b><p>Add addresses and receiving schedules. Coordinates can be added now or geocoded when the mapping connection is enabled.</p></div>
      </article>
    </div>
  </>;
}

function Progress({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return <div className="progress"><div><strong>{label}</strong><span>{value} of {target}</span></div><div className="bar"><i style={{ width: `${Math.min(value / target, 1) * 100}%`, background: color }} /></div></div>;
}

function PartnerTable({ type, records, onAdd, onEdit, onDelete, deletingId }: {
  type: PartnerKind; records: Partner[]; onAdd: () => void; onEdit: (record: Partner) => void;
  onDelete: (kind: PartnerKind, record: Partner) => void; deletingId: number | null;
}) {
  if (!records.length) return <div className="adminEmpty"><span>{type === "bakery" ? "B" : "P"}</span><h2>No {type === "bakery" ? "bakeries" : "pantries"} yet</h2><p>Add the first organization you plan to onboard.</p><button className="solidBtn" onClick={onAdd}>+ Add {type}</button></div>;
  return <div className="tablePanel"><table><thead><tr><th>Organization</th><th>Recurring days</th><th>Hours</th>{type === "pantry" && <th>Priority</th>}<th>Status</th><th>Actions</th></tr></thead><tbody>
    {records.map((record) => {
      const pantry = type === "pantry" ? record as Pantry : null;
      const schedule = pantry ? parseSchedule(pantry) : null;
      const bakerySchedule = type === "bakery" ? parseBakerySchedule(record as Bakery) : null;
      return <tr key={record.id}><td><strong>{record.name}</strong><small>{record.address}</small></td><td>{record.recurringDays}</td><td>{pantry && schedule
        ? <div className="hoursSummary">{schedule.map((window, index) => <small key={`${window.recurrence}-${window.day}-${window.ordinal}-${index}`}><b>{describeWindow(window)}</b> {formatTime(window.open)}–{formatTime(window.close)} · latest {formatTime(window.latestArrival)}</small>)}</div>
        : <div className="hoursSummary">{days.filter((day) => bakerySchedule?.[day]).map((day) => <small key={day}><b>{day}</b> ready {formatTime(bakerySchedule![day]!.readyTime)} · deadline {formatTime(bakerySchedule![day]!.pickupDeadline)}</small>)}</div>}</td>{pantry && <td><b className="score">{(1 / (1 + pantry.deliveriesSevenDays)).toFixed(2)}</b><small>{pantry.deliveriesSevenDays} deliveries / 7 days</small></td>}<td><span className="activePill">Active</span></td><td><div className="rowActions"><button onClick={() => onEdit(record)}>Edit</button><button className="deleteAction" disabled={deletingId === record.id} onClick={() => onDelete(type, record)}>{deletingId === record.id ? "Deleting…" : "Delete"}</button></div></td></tr>;
    })}
  </tbody></table></div>;
}

function RoutesTable({ routes, compact = false }: { routes: Route[]; compact?: boolean }) {
  if (!routes.length) return <Empty title="No route activity" body="Routes will appear after bakery pickups are reserved." />;
  return <div className={compact ? "routeRows" : "tablePanel"}>{compact ? routes.map((route) => <div className="routeRow" key={route.id}><span className={`statusDot ${route.status}`} /><div><strong>{route.bakeryName} → {route.pantryName}</strong><small>{route.driverName} · {route.scheduledArrival}</small></div><b>{route.status}</b></div>) :
    <table><thead><tr><th>Route</th><th>Driver</th><th>Scheduled arrival</th><th>Status</th></tr></thead><tbody>{routes.map((route) => <tr key={route.id}><td><strong>{route.bakeryName} → {route.pantryName}</strong></td><td>{route.driverName}</td><td>{route.scheduledArrival}</td><td><span className={`routeStatus ${route.status}`}>{route.status}</span></td></tr>)}</tbody></table>}
  </div>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return <div className="smallEmpty"><span>↗</span><div><strong>{title}</strong><p>{body}</p></div></div>;
}

function RecordModal({ kind, record, saving, onClose, onSave }: {
  kind: PartnerKind; record?: Partner; saving: boolean; onClose: () => void;
  onSave: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const initialDays = record?.recurringDays.split(",").map((day) => day.trim()).filter(Boolean) ?? [];
  const existingBakerySchedule = kind === "bakery" && record ? parseBakerySchedule(record as Bakery) : {};
  const [bakeryDays, setBakeryDays] = useState<string[]>(initialDays);
  const existingWindows = kind === "pantry" && record ? parseSchedule(record as Pantry) : [];
  const displayWindows = existingWindows.map((window) => ({
    ...window,
    open: formatTime(window.open),
    close: formatTime(window.close),
    latestArrival: formatTime(window.latestArrival),
  }));
  const [pantryWindows, setPantryWindows] = useState<ReceivingWindow[]>(displayWindows.length ? displayWindows : [{
    recurrence: "weekly", day: "Mon", ordinal: null, open: "", close: "", latestArrival: "",
  }]);
  const updateWindow = (index: number, patch: Partial<ReceivingWindow>) => {
    setPantryWindows((current) => current.map((window, windowIndex) => windowIndex === index ? { ...window, ...patch } : window));
  };
  const addWindow = () => setPantryWindows((current) => [...current, {
    recurrence: "weekly", day: "Mon", ordinal: null, open: "", close: "", latestArrival: "",
  }]);
  const removeWindow = (index: number) => setPantryWindows((current) => current.filter((_, windowIndex) => windowIndex !== index));

  return <div className="modalBackdrop" role="presentation"><div className="recordModal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div className="modalTitle"><div><span>{record ? "EDIT PARTNER" : "NEW PARTNER"}</span><h2 id="modal-title">{record ? "Edit" : "Add"} a {kind}</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
    <form onSubmit={onSave}>
      <div className="formGrid">
        <label className="wide">Organization name<input name="name" required defaultValue={record?.name} placeholder={kind === "bakery" ? "Flour & Field Bakery" : "Community Food Pantry"} /></label>
        <label className="wide">Street address<input name="address" required defaultValue={record?.address} placeholder="123 Main Street, Boston, MA" /></label>
        <label>Latitude <input name="latitude" type="number" step="any" defaultValue={record?.latitude ?? ""} placeholder="42.3601" /></label>
        <label>Longitude <input name="longitude" type="number" step="any" defaultValue={record?.longitude ?? ""} placeholder="-71.0589" /></label>
        <label>Contact name<input name="contactName" defaultValue={record?.contactName} /></label>
        <label>Contact email<input name="contactEmail" type="email" defaultValue={record?.contactEmail} /></label>
        <label className="wide">Contact phone<input name="contactPhone" type="tel" defaultValue={record?.contactPhone} /></label>
        {kind === "bakery" ? <fieldset className="wide bakeryHours"><legend>Pickup availability by day</legend><p>Turn on each pickup day and enter that day’s individual ready time and pickup deadline.</p>
          {days.map((day) => {
            const enabled = bakeryDays.includes(day);
            const daySchedule = existingBakerySchedule[day];
            return <div className={`bakeryDayRow ${enabled ? "enabled" : ""}`} key={day}>
              <label className="dayToggle"><input type="checkbox" name={`bakeryDay_${day}`} checked={enabled} onChange={(event) => setBakeryDays((current) => event.target.checked ? [...current, day] : current.filter((currentDay) => currentDay !== day))} /><span>{day}</span></label>
              <label>Food ready<input name={`bakeryReady_${day}`} type="text" inputMode="text" defaultValue={daySchedule?.readyTime ? formatTime(daySchedule.readyTime) : ""} placeholder="3:00 PM" disabled={!enabled} required={enabled} /></label>
              <label>Pickup deadline<input name={`bakeryDeadline_${day}`} type="text" inputMode="text" defaultValue={daySchedule?.pickupDeadline ? formatTime(daySchedule.pickupDeadline) : ""} placeholder="6:00 PM" disabled={!enabled} required={enabled} /></label>
            </div>;
          })}
        </fieldset> :
          <><fieldset className="wide receivingWindows"><legend>Receiving schedule</legend><p>Add as many windows as needed. A pantry can have two windows on one day or rules such as “2nd Saturday monthly.”</p>
            <input type="hidden" name="windowCount" value={pantryWindows.length} />
            {pantryWindows.map((window, index) => <div className="receivingWindow" key={index}>
              <div className="windowHeading"><strong>Window {index + 1}</strong>{pantryWindows.length > 1 && <button type="button" onClick={() => removeWindow(index)}>Remove</button>}</div>
              <label>Repeats<select name={`windowRecurrence_${index}`} value={window.recurrence} onChange={(event) => updateWindow(index, { recurrence: event.target.value as "weekly" | "monthly", ordinal: event.target.value === "monthly" ? (window.ordinal ?? 1) : null })}><option value="weekly">Every week</option><option value="monthly">Once a month</option></select></label>
              {window.recurrence === "monthly" && <label>Occurrence<select name={`windowOrdinal_${index}`} value={window.ordinal ?? 1} onChange={(event) => updateWindow(index, { ordinal: Number(event.target.value) })}>{ordinalLabels.slice(1).map((label, ordinalIndex) => <option key={label} value={ordinalIndex + 1}>{label}</option>)}</select></label>}
              <label>Day<select name={`windowDay_${index}`} value={window.day} onChange={(event) => updateWindow(index, { day: event.target.value })}>{days.map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
              <label>Opens<input name={`windowOpen_${index}`} type="text" inputMode="text" value={window.open} onChange={(event) => updateWindow(index, { open: event.target.value })} placeholder="9:00 AM" required /></label>
              <label>Closes<input name={`windowClose_${index}`} type="text" inputMode="text" value={window.close} onChange={(event) => updateWindow(index, { close: event.target.value })} placeholder="5:00 PM" required /></label>
              <label>Latest arrival<input name={`windowLatest_${index}`} type="text" inputMode="text" value={window.latestArrival} onChange={(event) => updateWindow(index, { latestArrival: event.target.value })} placeholder="4:30 PM" required /></label>
            </div>)}
            <button className="addWindowButton" type="button" onClick={addWindow}>+ Add another receiving window</button>
          </fieldset><label className="wide">Deliveries during recent receiving opportunities<input name="deliveriesSevenDays" type="number" min="0" defaultValue={(record as Pantry | undefined)?.deliveriesSevenDays ?? 0} /></label></>}
      </div>
      <div className="modalActions"><button type="button" onClick={onClose}>Cancel</button><button className="solidBtn" disabled={saving}>{saving ? "Saving…" : `${record ? "Update" : "Save"} ${kind}`}</button></div>
    </form>
  </div></div>;
}
