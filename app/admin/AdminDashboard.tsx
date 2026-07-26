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
type PantrySchedule = Partial<Record<string, DayHours>>;
type Route = {
  id: number; bakeryName: string; pantryName: string; driverName: string;
  scheduledArrival: string; status: "reserved" | "ongoing" | "completed";
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseSchedule(pantry: Pantry): PantrySchedule {
  try {
    const open = JSON.parse(pantry.openTime) as Record<string, string>;
    const close = JSON.parse(pantry.closeTime) as Record<string, string>;
    const latest = JSON.parse(pantry.latestArrival) as Record<string, string>;
    return Object.fromEntries(Object.keys(open).map((day) => [day, {
      open: open[day], close: close[day], latestArrival: latest[day],
    }]));
  } catch {
    return Object.fromEntries(pantry.recurringDays.split(",").map((day) => [day.trim(), {
      open: pantry.openTime, close: pantry.closeTime, latestArrival: pantry.latestArrival,
    }]));
  }
}

function formatTime(value: string) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
    .format(new Date(2000, 0, 1, hours, minutes));
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
      return <tr key={record.id}><td><strong>{record.name}</strong><small>{record.address}</small></td><td>{record.recurringDays}</td><td>{pantry && schedule
        ? <div className="hoursSummary">{days.filter((day) => schedule[day]).map((day) => <small key={day}><b>{day}</b> {formatTime(schedule[day]!.open)}–{formatTime(schedule[day]!.close)} · latest {formatTime(schedule[day]!.latestArrival)}</small>)}</div>
        : `${formatTime((record as Bakery).readyTime)}–${formatTime((record as Bakery).arrivalDeadline)}`}</td>{pantry && <td><b className="score">{(1 / (1 + pantry.deliveriesSevenDays)).toFixed(2)}</b><small>{pantry.deliveriesSevenDays} deliveries / 7 days</small></td>}<td><span className="activePill">Active</span></td><td><div className="rowActions"><button onClick={() => onEdit(record)}>Edit</button><button className="deleteAction" disabled={deletingId === record.id} onClick={() => onDelete(type, record)}>{deletingId === record.id ? "Deleting…" : "Delete"}</button></div></td></tr>;
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
  const pantrySchedule = kind === "pantry" && record ? parseSchedule(record as Pantry) : {};
  const initialDays = record?.recurringDays.split(",").map((day) => day.trim()).filter(Boolean) ?? [];
  const [enabledDays, setEnabledDays] = useState<string[]>(initialDays);
  const toggleDay = (day: string, enabled: boolean) => {
    setEnabledDays((current) => enabled
      ? [...current, day]
      : current.filter((currentDay) => currentDay !== day));
  };

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
        {kind === "bakery" && <fieldset className="wide"><legend>Recurring days</legend><div className="dayChecks">{days.map((day) => <label key={day}><input type="checkbox" name="day" value={day} defaultChecked={initialDays.includes(day)} onChange={(e) => {
          const form = e.currentTarget.form;
          if (form) {
            const selected = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="day"]:checked')).map((input) => input.value);
            (form.elements.namedItem("recurringDays") as HTMLInputElement).value = selected.join(", ");
          }
        }} /><span>{day}</span></label>)}</div><input type="hidden" name="recurringDays" required defaultValue={record?.recurringDays} /></fieldset>}
        {kind === "bakery" ? <><label>Ready time<input name="readyTime" type="time" required defaultValue={(record as Bakery | undefined)?.readyTime} /></label><label>Latest permitted arrival<input name="arrivalDeadline" type="time" required defaultValue={(record as Bakery | undefined)?.arrivalDeadline} /></label></> :
          <><fieldset className="wide dailyHours"><legend>Receiving hours by day</legend><p>Turn on each day the pantry accepts deliveries. The latest arrival can be earlier than closing.</p>
            {days.map((day) => {
              const enabled = enabledDays.includes(day);
              return <div className={`dayHoursRow ${enabled ? "enabled" : ""}`} key={day}>
                <label className="dayToggle"><input type="checkbox" name={`day_${day}`} checked={enabled} onChange={(event) => toggleDay(day, event.target.checked)} /><span>{day}</span></label>
                <label>Opens<input name={`openTime_${day}`} aria-label={`${day} opening time`} type="text" inputMode="text" defaultValue={pantrySchedule[day]?.open ? formatTime(pantrySchedule[day]!.open) : ""} placeholder="9:00 AM" disabled={!enabled} required={enabled} /></label>
                <label>Closes<input name={`closeTime_${day}`} aria-label={`${day} closing time`} type="text" inputMode="text" defaultValue={pantrySchedule[day]?.close ? formatTime(pantrySchedule[day]!.close) : ""} placeholder="5:00 PM" disabled={!enabled} required={enabled} /></label>
                <label>Latest arrival<input name={`latestArrival_${day}`} aria-label={`${day} latest arrival`} type="text" inputMode="text" defaultValue={pantrySchedule[day]?.latestArrival ? formatTime(pantrySchedule[day]!.latestArrival) : ""} placeholder="4:30 PM" disabled={!enabled} required={enabled} /></label>
              </div>;
            })}
          </fieldset><label className="wide">Deliveries in last 7 days<input name="deliveriesSevenDays" type="number" min="0" defaultValue={(record as Pantry | undefined)?.deliveriesSevenDays ?? 0} /></label></>}
      </div>
      <div className="modalActions"><button type="button" onClick={onClose}>Cancel</button><button className="solidBtn" disabled={saving}>{saving ? "Saving…" : `${record ? "Update" : "Save"} ${kind}`}</button></div>
    </form>
  </div></div>;
}
