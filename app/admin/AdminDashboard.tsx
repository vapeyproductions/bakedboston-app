"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminMap, milesBetween } from "./AdminMap";
import "./admin.css";
import "./partner-workspace.css";
import "../availability-calendar.css";

type Bakery = {
  id: number; name: string; address: string; dropoffInstructions: string; recurringDays: string; readyTime: string;
  businessOpenTime: string; businessCloseTime: string;
  arrivalDeadline: string; active: boolean; latitude: number | null; longitude: number | null;
  formattedAddress: string; googlePlaceId: string; addressValidationStatus: "unvalidated" | "validated" | "needs_review";
  contactName: string; contactEmail: string; contactPhone: string; businessPhone: string; notificationPhone: string;
};
type Pantry = {
  id: number; name: string; address: string; dropoffInstructions: string; recurringDays: string; openTime: string;
  closeTime: string; latestArrival: string; deliveriesSevenDays: number; active: boolean;
  latitude: number | null; longitude: number | null; contactName: string; contactEmail: string;
  formattedAddress: string; googlePlaceId: string; addressValidationStatus: "unvalidated" | "validated" | "needs_review";
  contactPhone: string; businessPhone: string; notificationPhone: string;
};
type PartnerAccount = {
  id: number; organizationType: PartnerKind; organizationId: number; accountEmail: string;
  administratorName: string; contactEmail: string; contactPhone: string; active: boolean;
};
type PartnerInvitation = {
  id: number; organizationType: PartnerKind; organizationId: number; accountEmail: string;
  expiresAt: string; acceptedAt: string | null; createdAt: string;
};
type Administrator = {
  id: number; email: string; displayName: string; isMaster: boolean; active: boolean; createdAt: string;
};
type AdminInvitation = {
  id: number; email: string; invitedByAdminId: number; expiresAt: string; acceptedAt: string | null; createdAt: string;
};
type AuditEntry = {
  id: number; actorType: "admin" | "partner" | "system"; actorId: number | null; actorName: string;
  action: string; entityType: string; entityId: number | null; entityName: string; details: string; createdAt: string;
};
type OrganizationContact = {
  id: number; organizationType: PartnerKind; organizationId: number;
  name: string; email: string; phone: string; isPrimary: boolean;
};
type PantryAccessPhoto = { id: number; pantryId: number; imageUrl: string; pathname: string; caption: string };
type BakeryAccessPhoto = { id: number; bakeryId: number; imageUrl: string; pathname: string; caption: string };
type AccessPhoto = PantryAccessPhoto | BakeryAccessPhoto;
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
type AvailabilityWindow = { id: number; organizationType: PartnerKind; organizationId: number; startsAt: string; endsAt: string; latestArrival: string; paused: boolean };
type AvailabilityPause = { id: number; organizationType: PartnerKind; organizationId: number; endsAt: string };
type DriverAccount = { id: number; email: string; displayName: string; active: boolean };
type ScheduleException = { id: number; organizationType: PartnerKind; organizationId: number; exceptionDate: string };
type PickupOccurrence = { id: number; bakeryId: number; serviceDate: string; pickupWindowStartsAt: string; pickupDeadline: string; status: string; confirmedAt: string | null };
type InAppNotification = { id: number; recipientType: "driver" | "bakery" | "pantry" | "admin"; recipientId: number; title: string; body: string; actionRequired: boolean; createdAt: string };

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 ? "30" : "00";
  const value = `${String(hours).padStart(2, "0")}:${minutes}`;
  return { value, label: formatTime(value) };
});

function parseSchedule(pantry: Pick<Pantry, "openTime" | "closeTime" | "latestArrival" | "recurringDays">): ReceivingWindow[] {
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

function parseBakerySchedule(bakery: Pick<Bakery, "readyTime" | "arrivalDeadline" | "recurringDays">): BakerySchedule {
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

function parseBakeryBusinessHours(bakery: Pick<Bakery, "businessOpenTime" | "businessCloseTime">) {
  try {
    const opens = JSON.parse(bakery.businessOpenTime) as Record<string, string>;
    const closes = JSON.parse(bakery.businessCloseTime) as Record<string, string>;
    return Object.fromEntries(Object.keys(opens).map((day) => [day, { open: opens[day], close: closes[day] ?? "" }]));
  } catch {
    return {};
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

function bakeryMatchesAvailability(bakery: Pick<Bakery, "readyTime" | "arrivalDeadline" | "recurringDays">, day: string, time: string) {
  const schedule = parseBakerySchedule(bakery);
  const candidateDays = day ? [day] : Object.keys(schedule);
  return candidateDays.some((candidateDay) => {
    const window = schedule[candidateDay];
    return Boolean(window) && (!time || (window!.readyTime <= time && time <= window!.pickupDeadline));
  });
}

function pantryMatchesAvailability(pantry: Pick<Pantry, "openTime" | "closeTime" | "latestArrival" | "recurringDays">, day: string, time: string) {
  return parseSchedule(pantry).some((window) =>
    (!day || window.day === day) && (!time || (window.open <= time && time <= window.close)));
}

export default function AdminDashboard({ user }: { user: { name: string; email: string; isMaster: boolean } }) {
  const [tab, setTab] = useState<"overview" | "bakeries" | "pantries" | "accounts" | "map" | "routes" | "change log" | "settings">("overview");
  const [bakeries, setBakeries] = useState<Bakery[]>([]);
  const [pantries, setPantries] = useState<Pantry[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [partnerAccounts, setPartnerAccounts] = useState<PartnerAccount[]>([]);
  const [partnerInvitations, setPartnerInvitations] = useState<PartnerInvitation[]>([]);
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [adminInvitations, setAdminInvitations] = useState<AdminInvitation[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [organizationContacts, setOrganizationContacts] = useState<OrganizationContact[]>([]);
  const [pantryAccessPhotos, setPantryAccessPhotos] = useState<PantryAccessPhoto[]>([]);
  const [bakeryAccessPhotos, setBakeryAccessPhotos] = useState<BakeryAccessPhoto[]>([]);
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>([]);
  const [availabilityPauses, setAvailabilityPauses] = useState<AvailabilityPause[]>([]);
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [scheduleExceptions, setScheduleExceptions] = useState<ScheduleException[]>([]);
  const [pickupOccurrences, setPickupOccurrences] = useState<PickupOccurrence[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ kind: PartnerKind; record?: Partner } | null>(null);
  const [workspaceRecord, setWorkspaceRecord] = useState<{ kind: PartnerKind; record: Partner } | null>(null);
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
      setPartnerAccounts(data.partnerAccounts ?? []);
      setPartnerInvitations(data.partnerInvitations ?? []);
      setAdministrators(data.administrators ?? []);
      setAdminInvitations(data.adminInvitations ?? []);
      setAuditEntries(data.auditLog ?? []);
      setOrganizationContacts(data.organizationContacts ?? []);
      setPantryAccessPhotos(data.pantryAccessPhotos ?? []);
      setBakeryAccessPhotos(data.bakeryAccessPhotos ?? []);
      setAvailabilityWindows(data.availabilityWindows ?? []);
      setAvailabilityPauses(data.availabilityPauses ?? []);
      setDrivers(data.drivers ?? []);
      setScheduleExceptions(data.scheduleExceptions ?? []);
      setPickupOccurrences(data.pickupOccurrences ?? []);
      setNotifications(data.notifications ?? []);
    }
    setLoading(false);
  };

  // The initial request hydrates the client-only administrator dashboard.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
        <Link className="adminBrand" href="/"><span>B</span><strong>BakedBoston</strong></Link>
        <p className="workspaceLabel">ADMIN WORKSPACE</p>
        <nav>
          {(["overview", "bakeries", "pantries", "accounts", "map", "routes", "change log", "settings"] as const).map((item) => (
            <button className={tab === item ? "selected" : ""} key={item} onClick={() => setTab(item)}>
              <i>{item === "overview" ? "⌂" : item === "bakeries" ? "B" : item === "pantries" ? "P" : item === "accounts" ? "A" : item === "map" ? "⌖" : item === "change log" ? "≡" : item === "settings" ? "⚙" : "↗"}</i>
              {item}
              {item === "bakeries" && <small>{bakeries.length}</small>}
              {item === "pantries" && <small>{pantries.length}</small>}
              {item === "accounts" && <small>{partnerAccounts.length}</small>}
            </button>
          ))}
        </nav>
        <div className="adminUser">
          <span>{user.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{user.name}</strong><small>Administrator</small></div>
          <Link href="/" title="Return to site">↗</Link>
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
            {tab === "overview" && <Overview bakeries={bakeries} pantries={pantries} accounts={partnerAccounts} drivers={drivers} routes={routes} completed={completed} activeRoutes={activeRoutes} averagePriority={averagePriority} />}
            {tab === "bakeries" && <PartnerTable type="bakery" records={bakeries} accounts={partnerAccounts} invitations={partnerInvitations} onChanged={refresh} setNotice={setNotice} onAdd={() => setModal({ kind: "bakery" })} onEdit={(record) => setModal({ kind: "bakery", record })} onView={(record) => setWorkspaceRecord({ kind: "bakery", record })} onDelete={deleteRecord} deletingId={deletingId} />}
            {tab === "pantries" && <PartnerTable type="pantry" records={pantries} accounts={partnerAccounts} invitations={partnerInvitations} onChanged={refresh} setNotice={setNotice} onAdd={() => setModal({ kind: "pantry" })} onEdit={(record) => setModal({ kind: "pantry", record })} onView={(record) => setWorkspaceRecord({ kind: "pantry", record })} onDelete={deleteRecord} deletingId={deletingId} />}
            {tab === "accounts" && <PartnerAccountsWorkspace accounts={partnerAccounts} bakeries={bakeries} pantries={pantries} onChanged={refresh} setNotice={setNotice} onView={(kind, record) => setWorkspaceRecord({ kind, record })} />}
            {tab === "map" && <MapWorkspace bakeries={bakeries} pantries={pantries} accounts={partnerAccounts} onView={(kind, record) => setWorkspaceRecord({ kind, record })} />}
            {tab === "routes" && <RoutesTable routes={routes} />}
            {tab === "change log" && <ChangeLog entries={auditEntries} />}
            {tab === "settings" && <AdminSettings currentUser={user} administrators={administrators} invitations={adminInvitations} onChanged={refresh} setNotice={setNotice} />}
          </>
        )}
      </section>

      {modal && <RecordModal kind={modal.kind} record={modal.record} contacts={modal.record ? organizationContacts.filter((contact) => contact.organizationType === modal.kind && contact.organizationId === modal.record!.id) : []} photos={!modal.record ? [] : modal.kind === "pantry" ? pantryAccessPhotos.filter((photo) => photo.pantryId === modal.record!.id) : bakeryAccessPhotos.filter((photo) => photo.bakeryId === modal.record!.id)} saving={saving} onClose={() => setModal(null)} onSave={saveRecord} onChanged={refresh} setNotice={setNotice} />}
      {workspaceRecord && <AdminPartnerWorkspace kind={workspaceRecord.kind} record={workspaceRecord.record} routes={routes.filter((route) => workspaceRecord.kind === "pantry" ? route.pantryName === workspaceRecord.record.name : route.bakeryName === workspaceRecord.record.name)} availability={availabilityWindows.filter((window) => window.organizationType === workspaceRecord.kind && window.organizationId === workspaceRecord.record.id)} pauses={availabilityPauses.filter((pause) => pause.organizationType === workspaceRecord.kind && pause.organizationId === workspaceRecord.record.id)} scheduleExceptions={scheduleExceptions.filter((exception) => exception.organizationType === workspaceRecord.kind && exception.organizationId === workspaceRecord.record.id)} contacts={organizationContacts.filter((contact) => contact.organizationType === workspaceRecord.kind && contact.organizationId === workspaceRecord.record.id)} pickupOccurrences={pickupOccurrences.filter((pickup) => workspaceRecord.kind === "bakery" && pickup.bakeryId === workspaceRecord.record.id)} notifications={notifications.filter((notification) => notification.recipientType === workspaceRecord.kind && notification.recipientId === workspaceRecord.record.id)} onChanged={refresh} setNotice={setNotice} onClose={() => setWorkspaceRecord(null)} onEdit={() => { setModal(workspaceRecord); setWorkspaceRecord(null); }} />}
    </main>
  );
}

function Overview({ bakeries, pantries, accounts, drivers, routes, completed, activeRoutes, averagePriority }: {
  bakeries: Bakery[]; pantries: Pantry[]; accounts: PartnerAccount[]; drivers: DriverAccount[]; routes: Route[]; completed: number; activeRoutes: number; averagePriority: string;
}) {
  const registeredBakeries = new Set(accounts.filter((account) => account.organizationType === "bakery" && account.active).map((account) => account.organizationId)).size;
  const registeredPantries = new Set(accounts.filter((account) => account.organizationType === "pantry" && account.active).map((account) => account.organizationId)).size;
  const registeredDrivers = drivers.filter((driver) => driver.active).length;
  return <>
    <div className="metricGrid">
      <article><span>PARTNER BAKERIES</span><strong>{bakeries.length}</strong><small>{bakeries.length ? "Approved network" : "Ready for onboarding"}</small></article>
      <article><span>PARTNER PANTRIES</span><strong>{pantries.length}</strong><small>Average priority {averagePriority}</small></article>
      <article><span>ACTIVE ROUTES</span><strong>{activeRoutes}</strong><small>Reserved + ongoing</small></article>
      <article className="coralMetric"><span>COMPLETED ORDERS</span><strong>{completed}</strong><small>All-time total</small></article>
    </div>
    <div className="overviewGrid">
      <article className="panel">
        <div className="panelTitle"><div><span>ROUTE ACTIVITY</span><h2>Today’s delivery board</h2></div><i className="liveDot">LIVE</i></div>
        {routes.length ? <RoutesTable routes={routes.slice(0, 5)} compact /> : <Empty title="No routes yet" body="Reserved, ongoing, and completed routes will appear here automatically." />}
      </article>
      <article className="panel onboarding">
        <div className="panelTitle"><div><span>PARTNER SETUP</span><h2>Onboarding progress</h2></div></div>
        <Progress label="Registered bakeries" value={registeredBakeries} target={bakeries.length} color="#ef6548" />
        <Progress label="Registered pantries" value={registeredPantries} target={pantries.length} color="#f4bf43" />
        <div className="driverRegistrationCount"><span>REGISTERED DRIVERS</span><strong>{registeredDrivers}</strong><small>Active driver accounts</small></div>
      </article>
    </div>
  </>;
}

function Progress({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return <div className="progress"><div><strong>{label}</strong><span>{value}/{target}</span></div><div className="bar"><i style={{ width: `${target ? Math.min(value / target, 1) * 100 : 0}%`, background: color }} /></div></div>;
}

function PartnerTable({ type, records, accounts, invitations, onChanged, setNotice, onAdd, onEdit, onView, onDelete, deletingId }: {
  type: PartnerKind; records: Partner[]; onAdd: () => void; onEdit: (record: Partner) => void;
  accounts: PartnerAccount[]; invitations: PartnerInvitation[]; onChanged: () => Promise<void>;
  setNotice: (message: string) => void; onView: (record: Partner) => void; onDelete: (kind: PartnerKind, record: Partner) => void; deletingId: number | null;
}) {
  const [filterDay, setFilterDay] = useState("");
  const [filterTime, setFilterTime] = useState("");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"az" | "za" | "priority-high" | "priority-low">("az");
  const [registration, setRegistration] = useState<"" | "registered" | "unregistered">("");
  const visibleRecords = useMemo(() => records
    .filter((record) => `${record.name} ${record.address}`.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((record) => type === "bakery"
      ? bakeryMatchesAvailability(record as Bakery, filterDay, filterTime)
      : pantryMatchesAvailability(record as Pantry, filterDay, filterTime))
    .filter((record) => {
      if (!registration) return true;
      const isRegistered = accounts.some((account) => account.organizationType === type && account.organizationId === record.id);
      return registration === "registered" ? isRegistered : !isRegistered;
    })
    .sort((left, right) => {
      if (type === "pantry" && (sortOrder === "priority-high" || sortOrder === "priority-low")) {
        const leftScore = 1 / (1 + (left as Pantry).deliveriesSevenDays);
        const rightScore = 1 / (1 + (right as Pantry).deliveriesSevenDays);
        const scoreDifference = sortOrder === "priority-high" ? rightScore - leftScore : leftScore - rightScore;
        return scoreDifference || left.name.localeCompare(right.name);
      }
      return sortOrder === "za" ? right.name.localeCompare(left.name) : left.name.localeCompare(right.name);
    }), [records, accounts, type, filterDay, filterTime, registration, sortOrder, search]);

  if (!records.length) return <div className="adminEmpty"><span>{type === "bakery" ? "B" : "P"}</span><h2>No {type === "bakery" ? "bakeries" : "pantries"} yet</h2><p>Add the first organization you plan to onboard.</p><button className="solidBtn" onClick={onAdd}>+ Add {type}</button></div>;
  return <><div className="filterBar">
    <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${type === "bakery" ? "bakeries" : "pantries"}`} /></label>
    <label>Open day<select value={filterDay} onChange={(event) => setFilterDay(event.target.value)}><option value="">Any day</option>{days.map((day) => <option value={day} key={day}>{day}</option>)}</select></label>
    <label>Open at<select value={filterTime} onChange={(event) => setFilterTime(event.target.value)}><option value="">Any time</option>{timeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
    <label>Sort by<select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}><option value="az">Alphabetical: A to Z</option><option value="za">Alphabetical: Z to A</option>{type === "pantry" && <><option value="priority-high">Priority: highest to lowest</option><option value="priority-low">Priority: lowest to highest</option></>}</select></label>
    <label>Registration<select value={registration} onChange={(event) => setRegistration(event.target.value as typeof registration)}><option value="">All profiles</option><option value="registered">Registered</option><option value="unregistered">Unregistered</option></select></label>
    <span>{visibleRecords.length} of {records.length} shown</span>
  </div>
  {!visibleRecords.length ? <div className="filterEmpty">No {type === "bakery" ? "bakeries" : "pantries"} match this day and time.</div> : <div className="tablePanel"><table><thead><tr><th>Organization</th><th>Account access</th><th>Organization phones</th><th>Hours</th>{type === "pantry" && <th>Priority</th>}<th>Actions</th></tr></thead><tbody>
    {visibleRecords.map((record) => {
      const pantry = type === "pantry" ? record as Pantry : null;
      const schedule = pantry ? parseSchedule(pantry) : null;
      const bakerySchedule = type === "bakery" ? parseBakerySchedule(record as Bakery) : null;
      const organizationAccounts = accounts.filter((account) => account.organizationType === type && account.organizationId === record.id);
      const pendingInvitation = invitations.find((invite) => invite.organizationType === type && invite.organizationId === record.id && !invite.acceptedAt);
      return <tr key={record.id}><td><button className="organizationNameLink" onClick={() => onView(record)}>{record.name}</button><small>{record.address}</small><span className={organizationAccounts.length ? "registeredPill" : "unregisteredPill"}>{organizationAccounts.length ? "Registered" : "Unregistered"}</span></td><td><div className="accountSummary">{organizationAccounts.length ? organizationAccounts.map((account) => <div key={account.id}><strong>{account.accountEmail}</strong><small>Organization profile login</small></div>) : <ConnectAccount organizationType={type} organizationId={record.id} pendingEmail={pendingInvitation?.accountEmail} onChanged={onChanged} setNotice={setNotice} />}</div></td><td><strong>{record.businessPhone || "—"}</strong><small>Notifications: {record.notificationPhone || "—"}</small></td><td>{pantry && schedule
        ? <div className="hoursSummary">{schedule.map((window, index) => <small key={`${window.recurrence}-${window.day}-${window.ordinal}-${index}`}><b>{describeWindow(window)}</b> {formatTime(window.open)}–{formatTime(window.close)} · latest {formatTime(window.latestArrival)}</small>)}</div>
        : <div className="hoursSummary">{days.filter((day) => bakerySchedule?.[day]).map((day) => <small key={day}><b>{day}</b> ready {formatTime(bakerySchedule![day]!.readyTime)} · deadline {formatTime(bakerySchedule![day]!.pickupDeadline)}</small>)}</div>}</td>{pantry && <td><b className="score">{(1 / (1 + pantry.deliveriesSevenDays)).toFixed(2)}</b><small>{pantry.deliveriesSevenDays} deliveries / 7 days</small></td>}<td><div className="rowActions"><button onClick={() => onEdit(record)}>Edit</button><button className="deleteAction" disabled={deletingId === record.id} onClick={() => onDelete(type, record)}>{deletingId === record.id ? "Deleting…" : "Delete"}</button></div></td></tr>;
    })}
  </tbody></table></div>}</>;
}

function ConnectAccount({ organizationType, organizationId, pendingEmail, onChanged, setNotice }: {
  organizationType: PartnerKind; organizationId: number; pendingEmail?: string;
  onChanged: () => Promise<void>; setNotice: (message: string) => void;
}) {
  const [email, setEmail] = useState(pendingEmail ?? "");
  const [sending, setSending] = useState(false);
  async function connect() {
    setSending(true);
    const response = await fetch("/api/admin/partner-invitations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationType, organizationId, accountEmail: email }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      if (!data.emailSent && data.invitationUrl) {
        window.prompt("Email delivery is not configured yet. Copy this secure registration link to send manually:", data.invitationUrl);
      }
      setNotice(data.emailSent ? `Invitation sent to ${email}.` : "Invitation created; copy the registration link from the dialog.");
      await onChanged();
    } else setNotice(data?.error ?? "Could not connect account.");
    setSending(false);
  }
  return <div className="connectAccount"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Account email" /><button onClick={connect} disabled={sending || !email}>{sending ? "Sending…" : pendingEmail ? "Resend invitation" : "Connect account"}</button>{pendingEmail && <small>Invitation pending for {pendingEmail}</small>}</div>;
}

function ContactManager({ organizationType, organizationId, contacts, onChanged, setNotice }: {
  organizationType: PartnerKind; organizationId: number; contacts: OrganizationContact[];
  onChanged: () => Promise<void>; setNotice: (message: string) => void;
}) {
  const [draft, setDraft] = useState({ name: "", email: "", phone: "" });
  async function add() {
    const response = await fetch("/api/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationType, organizationId, ...draft }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setDraft({ name: "", email: "", phone: "" });
      setNotice("Primary organizational contact added.");
      await onChanged();
    } else setNotice(data?.error ?? "Could not add contact.");
  }
  async function remove(contact: OrganizationContact) {
    if (!window.confirm(`Delete ${contact.name} as a primary contact?`)) return;
    const response = await fetch(`/api/contacts?id=${contact.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setNotice("Primary organizational contact deleted.");
      await onChanged();
    } else setNotice(data?.error ?? "Could not delete contact.");
  }
  async function makePrimary(contact: OrganizationContact) {
    const response = await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: contact.id }) });
    const data = await response.json().catch(() => null);
    if (response.ok) { setNotice(`${contact.name} is now the primary contact.`); await onChanged(); }
    else setNotice(data?.error ?? "Could not change the primary contact.");
  }
  return <fieldset className="contactManager"><legend>Organizational contacts</legend><p>One contact is marked primary. Add as many additional contacts as the organization needs.</p>
    <div className="contactCards">{contacts.map((contact) => <article key={contact.id}><div><strong>{contact.isPrimary ? "★ PRIMARY · " : ""}{contact.name}</strong><small>{contact.email} · {contact.phone}</small></div><div>{!contact.isPrimary && <button type="button" onClick={() => makePrimary(contact)}>Make primary</button>}<button type="button" onClick={() => remove(contact)} disabled={contacts.length <= 1}>Delete</button></div></article>)}</div>
    <div className="addContactRow"><input aria-label="New contact name" placeholder="Contact name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><input aria-label="New contact email" type="email" placeholder="Contact email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /><input aria-label="New contact phone" type="tel" placeholder="Contact phone" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /><button type="button" onClick={add} disabled={!draft.name || !draft.email || !draft.phone}>+ Add contact</button></div>
  </fieldset>;
}

function PartnerAccountsWorkspace({ accounts, bakeries, pantries, onChanged, setNotice, onView }: {
  accounts: PartnerAccount[]; bakeries: Bakery[]; pantries: Pantry[];
  onChanged: () => Promise<void>; setNotice: (message: string) => void; onView: (kind: PartnerKind, record: Partner) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdding(true);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const [organizationType, organizationId] = String(payload.organizationKey ?? "").split(":");
    payload.organizationType = organizationType;
    payload.organizationId = organizationId;
    delete payload.organizationKey;
    const response = await fetch("/api/admin/partner-invitations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      event.currentTarget.reset();
      if (!data.emailSent && data.invitationUrl) {
        window.prompt("Email delivery is not configured yet. Copy this secure registration link to send manually:", data.invitationUrl);
      }
      setNotice(data.emailSent ? "Organization account invitation sent." : "Invitation created; copy the registration link from the dialog.");
      await onChanged();
    } else setNotice(data?.error ?? "Could not create account.");
    setAdding(false);
  }
  async function removeAccount(account: PartnerAccount) {
    if (!window.confirm(`Remove login access for ${account.accountEmail}?`)) return;
    const response = await fetch(`/api/admin/partner-accounts?id=${account.id}`, { method: "DELETE" });
    if (response.ok) {
      setNotice("Organization login access removed.");
      await onChanged();
    }
  }
  const organizationName = (account: PartnerAccount) =>
    (account.organizationType === "bakery" ? bakeries : pantries).find((record) => record.id === account.organizationId)?.name ?? "Unknown organization";
  const organizationRecord = (account: PartnerAccount) =>
    (account.organizationType === "bakery" ? bakeries : pantries).find((record) => record.id === account.organizationId);
  const visibleAccounts = accounts.filter((account) => `${account.accountEmail} ${organizationName(account)}`.toLowerCase().includes(search.trim().toLowerCase()));

  return <div className="accountsWorkspace">
    <form className="newAccountPanel" onSubmit={addAccount}>
      <div className="panelTitle"><div><span>ORGANIZATION LOGINS</span><h2>Add account access</h2></div></div>
      <p>Send an invitation to the chosen account email. The recipient creates their own password through a single-use registration link.</p>
      <div className="accountFormGrid">
        <label className="wide">Organization<select name="organizationKey" required><optgroup label="Bakeries">{bakeries.map((record) => <option key={`b-${record.id}`} value={`bakery:${record.id}`}>{record.name}</option>)}</optgroup><optgroup label="Pantries">{pantries.map((record) => <option key={`p-${record.id}`} value={`pantry:${record.id}`}>{record.name}</option>)}</optgroup></select></label>
        <label>Account email<input name="accountEmail" type="email" required /></label>
      </div>
      <button className="solidBtn" disabled={adding}>{adding ? "Sending…" : "Send account invitation"}</button>
    </form>
    <div className="accountListPanel"><label className="accountSearch">Search accounts<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Organization name or account email" /></label><div className="tablePanel accountTable"><table><thead><tr><th>Account email</th><th>Organization</th><th>Access</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {visibleAccounts.map((account) => <tr key={account.id}><td><strong>{account.accountEmail}</strong></td><td><button className="organizationNameLink" disabled={!organizationRecord(account)} onClick={() => { const record = organizationRecord(account); if (record) onView(account.organizationType, record); }}>{organizationName(account)}</button><small>{account.organizationType}</small></td><td><span>Organization profile login</span></td><td><span className="activePill">{account.active ? "Active" : "Paused"}</span></td><td><div className="rowActions"><button className="deleteAction" onClick={() => removeAccount(account)}>Remove access</button></div></td></tr>)}
      {!visibleAccounts.length && <tr><td colSpan={5}>{accounts.length ? "No accounts match this search." : "No partner accounts have been created yet."}</td></tr>}
    </tbody></table></div></div>
  </div>;
}

function MapWorkspace({ bakeries, pantries, accounts, onView }: { bakeries: Bakery[]; pantries: Pantry[]; accounts: PartnerAccount[]; onView: (kind: PartnerKind, record: Partner) => void }) {
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [showBakeries, setShowBakeries] = useState(true);
  const [showPantries, setShowPantries] = useState(true);
  const [showRadius, setShowRadius] = useState(false);
  const [registration, setRegistration] = useState<"" | "registered" | "unregistered">("");
  const registrationMatch = (type: PartnerKind, id: number) => {
    if (!registration) return true;
    const registered = accounts.some((account) => account.organizationType === type && account.organizationId === id);
    return registration === "registered" ? registered : !registered;
  };
  const filteredBakeries = bakeries.filter((bakery) => registrationMatch("bakery", bakery.id));
  const filteredPantries = pantries.filter((pantry) => registrationMatch("pantry", pantry.id));
  const mappedBakeries = filteredBakeries.filter((bakery) => bakery.latitude != null && bakery.longitude != null);
  const mappedPantries = filteredPantries.filter((pantry) => pantry.latitude != null && pantry.longitude != null);

  const distanceAnalysis = useMemo(() => {
    const pairs = mappedPantries.flatMap((pantry) => mappedBakeries.map((bakery) => ({
      pantry, bakery, distance: milesBetween(pantry, bakery)!,
    })));
    const nearest = mappedPantries.map((pantry) => {
      const distances = mappedBakeries.map((bakery) => milesBetween(pantry, bakery)!).filter(Number.isFinite);
      return distances.length ? Math.min(...distances) : null;
    }).filter((distance): distance is number => distance != null);
    return {
      pairs,
      averagePair: pairs.length ? pairs.reduce((sum, pair) => sum + pair.distance, 0) / pairs.length : 0,
      averageNearest: nearest.length ? nearest.reduce((sum, distance) => sum + distance, 0) / nearest.length : 0,
    };
  }, [mappedBakeries, mappedPantries]);

  const exportPartners = () => {
    const rows = [
      ["type", "name", "address", "latitude", "longitude", "recurring_days", "schedule", "contact_name", "contact_email", "contact_phone"],
      ...bakeries.map((bakery) => ["bakery", bakery.name, bakery.address, bakery.latitude, bakery.longitude, bakery.recurringDays, JSON.stringify(parseBakerySchedule(bakery)), bakery.contactName, bakery.contactEmail, bakery.contactPhone]),
      ...pantries.map((pantry) => ["pantry", pantry.name, pantry.address, pantry.latitude, pantry.longitude, pantry.recurringDays, JSON.stringify(parseSchedule(pantry)), pantry.contactName, pantry.contactEmail, pantry.contactPhone]),
    ];
    downloadCsv("bakedboston-partners.csv", rows);
  };
  const exportDistances = () => downloadCsv("bakedboston-distance-matrix.csv", [
    ["pantry", "bakery", "straight_line_miles"],
    ...distanceAnalysis.pairs.map((pair) => [pair.pantry.name, pair.bakery.name, pair.distance.toFixed(4)]),
  ]);

  return <div className="mapWorkspace">
    <div className="mapToolbar">
      <label>Open day<select value={day} onChange={(event) => setDay(event.target.value)}><option value="">Any day</option>{days.map((filterDay) => <option key={filterDay} value={filterDay}>{filterDay}</option>)}</select></label>
    <label>Open at<select value={time} onChange={(event) => setTime(event.target.value)}><option value="">Any time</option>{timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label>Registration<select value={registration} onChange={(event) => setRegistration(event.target.value as typeof registration)}><option value="">All profiles</option><option value="registered">Registered</option><option value="unregistered">Unregistered</option></select></label>
      <label className="mapCheck"><input type="checkbox" checked={showBakeries} onChange={(event) => setShowBakeries(event.target.checked)} /> Bakeries</label>
      <label className="mapCheck"><input type="checkbox" checked={showPantries} onChange={(event) => setShowPantries(event.target.checked)} /> Pantries</label>
      <label className="mapCheck radiusCheck"><input type="checkbox" checked={showRadius} disabled={!distanceAnalysis.averageNearest} onChange={(event) => setShowRadius(event.target.checked)} /> Target radius</label>
    </div>
    <AdminMap bakeries={filteredBakeries} pantries={filteredPantries} showBakeries={showBakeries} showPantries={showPantries} showRadius={showRadius} day={day} time={time} bakeryMatches={bakeryMatchesAvailability} pantryMatches={pantryMatchesAvailability} onOrganizationClick={(kind, id) => { const record = (kind === "bakery" ? bakeries : pantries).find((item) => item.id === id); if (record) onView(kind, record); }} />
    <div className="mapAnalysis">
      <article><span>MAPPED</span><strong>{mappedBakeries.length} bakeries · {mappedPantries.length} pantries</strong><small>{bakeries.length - mappedBakeries.length + pantries.length - mappedPantries.length} records need coordinates</small></article>
      <article><span>TARGET RADIUS</span><strong>{distanceAnalysis.averageNearest ? `${distanceAnalysis.averageNearest.toFixed(2)} mi` : "—"}</strong><small>Average distance from each pantry to its nearest bakery</small></article>
      <article><span>ALL PAIRS AVERAGE</span><strong>{distanceAnalysis.averagePair ? `${distanceAnalysis.averagePair.toFixed(2)} mi` : "—"}</strong><small>{distanceAnalysis.pairs.length} pantry–bakery coordinate pairs</small></article>
      <article className="exportCard"><span>DATA EXPORT</span><div><button onClick={exportPartners}>Download partners CSV</button><button onClick={exportDistances} disabled={!distanceAnalysis.pairs.length}>Download distances CSV</button></div><small>CSV files can be opened in Excel, Python, R, or uploaded back here for analysis.</small></article>
    </div>
  </div>;
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null>>) {
  const csv = rows.map((row) => row.map((value) => {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ChangeLog({ entries }: { entries: AuditEntry[] }) {
  const [query, setQuery] = useState("");
  const [actorType, setActorType] = useState("");
  const visible = entries.filter((entry) =>
    (!actorType || entry.actorType === actorType) &&
    (!query || `${entry.actorName} ${entry.action} ${entry.entityName} ${entry.details}`.toLowerCase().includes(query.toLowerCase())));
  return <div className="changeLogWorkspace">
    <div className="sectionLead"><span>PRIVATE AUDIT TRAIL</span><h2>Change log</h2><p>Database changes made by BakedBoston administrators, bakery and pantry accounts, and system registration flows.</p></div>
    <div className="filterBar"><label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Person, organization, or action" /></label><label>Actor<select value={actorType} onChange={(event) => setActorType(event.target.value)}><option value="">Everyone</option><option value="admin">Administrators</option><option value="partner">Partners</option><option value="system">System</option></select></label><span>{visible.length} events</span></div>
    <div className="auditList">{visible.map((entry) => <article key={entry.id}><span className={`auditActor ${entry.actorType}`}>{entry.actorType === "admin" ? "A" : entry.actorType === "partner" ? "P" : "S"}</span><div><strong>{entry.actorName} <b>{entry.action}</b>{entry.entityName ? ` — ${entry.entityName}` : ""}</strong><small>{entry.details || entry.entityType}</small></div><time>{new Date(entry.createdAt).toLocaleString()}</time></article>)}{!visible.length && <div className="filterEmpty">No change-log entries match this filter.</div>}</div>
  </div>;
}

function AdminSettings({ currentUser, administrators, invitations, onChanged, setNotice }: {
  currentUser: { name: string; email: string; isMaster: boolean };
  administrators: Administrator[]; invitations: AdminInvitation[];
  onChanged: () => Promise<void>; setNotice: (message: string) => void;
}) {
  const [working, setWorking] = useState(false);
  async function action(payload: Record<string, unknown>) {
    setWorking(true);
    const response = await fetch("/api/admin/settings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    setWorking(false);
    if (!response.ok) {
      setNotice(data?.error ?? "Could not update administrator settings.");
      return false;
    }
    await onChanged();
    return data;
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    const data = await action({ action: "invite", email });
    if (data) {
      if (!data.emailSent && data.invitationUrl) window.prompt("Email delivery is not configured. Copy this secure admin invitation:", data.invitationUrl);
      setNotice(data.emailSent ? `Administrator invitation sent to ${email}.` : "Invitation created; copy the link from the dialog.");
      event.currentTarget.reset();
    }
  }
  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (await action({ action: "update-profile", ...payload })) {
      setNotice("Administrator profile updated. Sign in with the new email next time.");
    }
  }
  async function transfer(admin: Administrator) {
    if (!window.confirm(`Transfer master administrator status to ${admin.displayName}? You will no longer be able to delete administrators.`)) return;
    if (await action({ action: "transfer-master", adminId: admin.id })) {
      setNotice(`Master status transferred to ${admin.displayName}.`);
      window.location.reload();
    }
  }
  async function remove(admin: Administrator) {
    if (!window.confirm(`Permanently remove administrator access for ${admin.displayName}?`)) return;
    if (await action({ action: "delete-admin", adminId: admin.id })) setNotice(`${admin.displayName} removed.`);
  }
  const pending = invitations.filter((invitation) => !invitation.acceptedAt && new Date(invitation.expiresAt) > new Date());
  return <div className="settingsWorkspace">
    <div className="sectionLead"><span>ADMINISTRATION</span><h2>Settings</h2><p>Manage your profile, invite administrators, and protect the required master account.</p></div>
    <div className="settingsGrid">
      <form className="settingsCard" onSubmit={updateProfile}><h3>Your administrator profile</h3><label>Display name<input name="displayName" defaultValue={currentUser.name} required /></label><label>Login email<input name="email" type="email" defaultValue={currentUser.email} required /></label><label>New password<input name="newPassword" type="password" minLength={10} placeholder="Leave blank to keep current password" /></label><button className="solidBtn" disabled={working}>Save profile</button></form>
      <form className="settingsCard" onSubmit={invite}><h3>Invite an administrator</h3><p>Invited administrators receive equivalent database access. Only the master can remove admins or delegate master status.</p><label>Email<input name="email" type="email" required /></label><button className="solidBtn" disabled={working}>Send invitation</button>{pending.map((invitation) => <small key={invitation.id}>Pending: {invitation.email} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</small>)}</form>
    </div>
    <div className="tablePanel administratorTable"><table><thead><tr><th>Administrator</th><th>Role</th><th>Status</th><th>Controls</th></tr></thead><tbody>{administrators.map((admin) => <tr key={admin.id}><td><strong>{admin.displayName}</strong><small>{admin.email}</small></td><td><span className={admin.isMaster ? "masterPill" : "activePill"}>{admin.isMaster ? "Master administrator" : "Administrator"}</span></td><td>{admin.active ? "Active" : "Paused"}</td><td><div className="rowActions">{currentUser.isMaster && !admin.isMaster && <><button onClick={() => transfer(admin)}>Make master</button><button className="deleteAction" onClick={() => remove(admin)}>Remove</button></>}</div></td></tr>)}</tbody></table></div>
  </div>;
}

function AdminPartnerWorkspace({ kind, record, routes, availability, pauses, scheduleExceptions, contacts, pickupOccurrences, notifications, onClose, onEdit, onChanged, setNotice }: {
  kind: PartnerKind; record: Partner; routes: Route[]; availability: AvailabilityWindow[]; pauses: AvailabilityPause[]; scheduleExceptions: ScheduleException[]; contacts: OrganizationContact[]; pickupOccurrences: PickupOccurrence[]; notifications: InAppNotification[]; onClose: () => void; onEdit: () => void; onChanged: () => Promise<void>; setNotice: (message: string) => void;
}) {
  const [section, setSection] = useState<"overview" | "deliveries" | "schedule" | "profile">("overview");
  const [addressStatus, setAddressStatus] = useState(record.addressValidationStatus);
  const [displayAddress, setDisplayAddress] = useState(record.address);
  const [confirmingAddress, setConfirmingAddress] = useState(false);
  const now = new Date();
  const activeAdditional = availability.filter((window) => new Date(window.startsAt) <= now && new Date(window.endsAt) > now);
  const recurringOpen = !scheduleExceptions.some((exception) => exception.exceptionDate === adminDateKey(now)) && (kind === "pantry"
    ? pantryMatchesAvailability(record as Pantry, days[(now.getDay() + 6) % 7], `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`)
    : bakeryMatchesAvailability(record as Bakery, days[(now.getDay() + 6) % 7], `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`));
  const schedulePaused = pauses.some((pause) => new Date(pause.endsAt) > now);
  const open = (recurringOpen && !schedulePaused) || activeAdditional.some((window) => !window.paused);
  const completed = routes.filter((route) => route.status === "completed").length;
  const todayPickup = pickupOccurrences.find((pickup) => pickup.serviceDate === adminDateKey(now));
  async function acceptStandardizedAddress() {
    if (!record.formattedAddress || !window.confirm(`Use Google’s standardized address for ${record.name}?\n\n${record.formattedAddress}`)) return;
    setConfirmingAddress(true);
    const response = await fetch("/api/admin/address-validation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationType: kind, organizationId: record.id, action: "accept_standardized" }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setAddressStatus("validated");
      setDisplayAddress(data.record.address);
      await onChanged();
      setNotice(`${record.name}'s standardized address was confirmed and is now eligible for optimization.`);
    } else {
      setNotice(data?.error ?? "Could not confirm this address.");
    }
    setConfirmingAddress(false);
  }
  return <div className="modalBackdrop"><section className="adminPartnerWorkspace">
    <header><div><span>{kind.toUpperCase()} WORKSPACE</span><h2>{record.name}</h2></div><button onClick={onClose}>×</button></header>
    <nav>{(["overview", "deliveries", "schedule", "profile"] as const).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>{item}</button>)}</nav>
    <main>
      {section === "overview" && <>{kind === "bakery" && <article className={`adminPickupCommitment ${todayPickup?.status === "confirmed" || todayPickup?.status === "reserved" ? "confirmed" : ""}`}><small>TODAY’S PICKUP COMMITMENT</small><h3>{todayPickup ? todayPickup.status.replaceAll("_", " ") : "No dated pickup created"}</h3><p>{todayPickup ? `${new Date(todayPickup.pickupWindowStartsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${new Date(todayPickup.pickupDeadline).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "The daily occurrence appears when the bakery opens its web or mobile workspace."}</p></article>}<article className={`adminAvailabilityCard ${open ? "open" : ""}`}><small>CURRENT AVAILABILITY</small><h3>{open ? "Open to accept deliveries" : schedulePaused || activeAdditional.some((window) => window.paused) ? "Availability paused" : "Closed right now"}</h3><p>{activeAdditional.length ? `One-time availability until ${new Date(activeAdditional[0].endsAt).toLocaleString()}${activeAdditional[0].paused ? " · paused" : ""}` : recurringOpen ? schedulePaused ? "The current recurring window is paused." : "Open according to the recurring schedule." : "No recurring or one-time window is currently open."}</p></article><div className="adminWorkspaceMetrics"><article><small>Completed deliveries</small><strong>{completed}</strong></article><article><small>Active deliveries</small><strong>{routes.length - completed}</strong></article><article><small>Notifications</small><strong>{notifications.length}</strong></article></div></>}
      {section === "deliveries" && <RoutesTable routes={routes} />}
      {section === "schedule" && <div className="adminScheduleView"><div className="panelTitle"><div><span>RECURRING SCHEDULE</span><h2>Saved availability</h2></div></div>{kind === "pantry" ? <AdminReceivingCalendar pantry={record as Pantry} availability={availability} scheduleExceptions={scheduleExceptions} organizationId={record.id} onChanged={onChanged} setNotice={setNotice} /> : <AdminBakeryCalendar bakery={record as Bakery} availability={availability} scheduleExceptions={scheduleExceptions} organizationId={record.id} onChanged={onChanged} setNotice={setNotice} />}</div>}
      {section === "profile" && <div className="adminProfileSummary">
        <article className="adminAddressSummary">
          <div className="adminAddressHeading"><small>ADDRESS</small><span className={`addressStatus ${addressStatus}`}>{addressStatus === "validated" ? "Validated" : addressStatus === "needs_review" ? "Needs review" : "Not yet validated"}</span></div>
          <strong>{displayAddress}</strong>
          {addressStatus === "validated" && <p>This location is eligible for live optimization.</p>}
          {addressStatus === "unvalidated" && <p>This registered location will be checked during the next address-validation sync and is not yet eligible for optimization.</p>}
          {addressStatus === "needs_review" && <div className="addressReviewPanel">
            <p>Google found a standardized version that differs from the entered address. Confirm it before this location is used by the optimizer.</p>
            <div><small>ENTERED ADDRESS</small><strong>{record.address}</strong></div>
            <div><small>GOOGLE STANDARDIZED ADDRESS</small><strong>{record.formattedAddress || "No standardized address returned"}</strong></div>
            <div className="addressReviewActions">
              <button className="solidBtn" disabled={confirmingAddress || !record.formattedAddress} onClick={acceptStandardizedAddress}>{confirmingAddress ? "Confirming…" : "Accept standardized address"}</button>
              <button onClick={onEdit}>Edit entered address</button>
            </div>
          </div>}
        </article>
        <article><small>BUSINESS PHONE</small><strong>{record.businessPhone || "—"}</strong></article><article><small>NOTIFICATION CONTACT</small><strong>{record.notificationPhone || "—"}</strong></article><article><small>ORGANIZATIONAL CONTACTS</small>{contacts.map((contact) => <div key={contact.id}><strong>{contact.isPrimary ? "★ Primary · " : ""}{contact.name}</strong><span>{contact.email} · {contact.phone}</span></div>)}</article><button className="solidBtn" onClick={onEdit}>Edit organization profile</button></div>}
    </main>
  </section></div>;
}

function AdminReceivingCalendar({ pantry, availability, scheduleExceptions, organizationId, onChanged, setNotice }: { pantry: Pantry; availability: AvailabilityWindow[]; scheduleExceptions: ScheduleException[]; organizationId: number; onChanged: () => Promise<void>; setNotice: (message: string) => void }) {
  const [windows, setWindows] = useState<ReceivingWindow[]>(() => parseSchedule(pantry));
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [selectedRecurring, setSelectedRecurring] = useState<number | null>(null);
  const [selectedRecurringDate, setSelectedRecurringDate] = useState<string | null>(null);
  const selected = selectedId === "new" ? null : availability.find((window) => window.id === selectedId);
  const [draft, setDraft] = useState({ startsAt: "", endsAt: "", latestArrival: "", paused: false });
  function selectWindow(window: AvailabilityWindow) { setSelectedRecurring(null); setSelectedId(window.id); setDraft({ startsAt: adminLocalInput(new Date(window.startsAt)), endsAt: adminLocalInput(new Date(window.endsAt)), latestArrival: adminLocalInput(new Date(window.latestArrival)), paused: window.paused }); }
  function selectRecurring(index: number, date?: string) { setSelectedId(null); setSelectedRecurring(index); setSelectedRecurringDate(date ?? null); }
  function addRecurring() { setSelectedId(null); setWindows((current) => [...current, { recurrence: "weekly", day: "Mon", ordinal: null, open: "09:00", close: "17:00", latestArrival: "16:30" }]); setSelectedRecurring(windows.length); }
  function addWindow() { const start = new Date(Date.now() + 24 * 60 * 60 * 1000); start.setHours(9, 0, 0, 0); setDraft({ startsAt: adminLocalInput(start), endsAt: adminLocalInput(new Date(start.getTime() + 2 * 60 * 60 * 1000)), latestArrival: adminLocalInput(new Date(start.getTime() + 105 * 60 * 1000)), paused: false }); setSelectedRecurring(null); setSelectedId("new"); }
  function updateRecurring(index: number, patch: Partial<ReceivingWindow>) { setWindows((current) => current.map((window, rowIndex) => rowIndex === index ? { ...window, ...patch } : window)); }
  async function saveRecurring() {
    const response = await fetch("/api/admin/schedule", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationType: "pantry", organizationId, windows }) });
    const data = await response.json().catch(() => null);
    if (response.ok) { setSelectedRecurring(null); await onChanged(); setNotice("Recurring schedule updated. The partner portal now shows the same schedule."); }
    else setNotice(data?.error ?? "Could not save the recurring schedule.");
  }
  async function cancelOccurrence() {
    if (!selectedRecurringDate || !window.confirm(`Cancel scheduled hours on ${new Date(`${selectedRecurringDate}T12:00:00`).toLocaleDateString()}?`)) return;
    const response = await fetch("/api/admin/schedule-exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationType: "pantry", organizationId, exceptionDate: selectedRecurringDate }) });
    if (response.ok) { setSelectedRecurring(null); await onChanged(); setNotice("Scheduled hours cancelled for that date."); }
  }
  async function restoreOccurrence(exception: ScheduleException) {
    const response = await fetch(`/api/admin/schedule-exceptions?id=${exception.id}`, { method: "DELETE" });
    if (response.ok) { await onChanged(); setNotice("Scheduled hours restored."); }
  }
  async function deleteRecurring() {
    if (selectedRecurring === null || windows.length <= 1 || !window.confirm("Delete this recurring availability window?")) return;
    const next = windows.filter((_, index) => index !== selectedRecurring);
    const response = await fetch("/api/admin/schedule", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, windows: next }) });
    const data = await response.json().catch(() => null);
    if (response.ok) { setWindows(next); setSelectedRecurring(null); await onChanged(); setNotice("Recurring availability window deleted."); }
    else setNotice(data?.error ?? "Could not delete the recurring window.");
  }
  async function saveWindow() {
    const response = await fetch("/api/admin/availability", { method: selectedId === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(selectedId === "new" ? { organizationType: "pantry", organizationId } : { id: selectedId }), startsAt: new Date(draft.startsAt).toISOString(), endsAt: new Date(draft.endsAt).toISOString(), latestArrival: new Date(draft.latestArrival).toISOString(), paused: draft.paused }) });
    const data = await response.json().catch(() => null);
    if (response.ok) { setSelectedId(null); await onChanged(); setNotice(selected ? "One-time availability updated." : "One-time availability added."); }
    else setNotice(data?.error ?? "Could not save this availability window.");
  }
  async function deleteWindow() {
    if (typeof selectedId !== "number" || !window.confirm("Delete this one-time availability window?")) return;
    const response = await fetch(`/api/admin/availability?id=${selectedId}`, { method: "DELETE" });
    if (response.ok) { setSelectedId(null); await onChanged(); setNotice("One-time availability deleted."); }
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const dates = Array.from({ length: 28 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  const recurring = selectedRecurring === null ? null : windows[selectedRecurring];
  return <><div className="adminCalendarToolbar"><button onClick={addRecurring}>+ Add recurring window</button><button className="solidBtn" onClick={addWindow}>+ Add one-time availability window</button></div>
  {recurring && <section className="adminOneTimeEditor adminRecurringEditor"><div><span>EDIT RECURRING WINDOW</span><h3>{recurring.day} receiving window</h3></div><label>Repeats<select value={recurring.recurrence} onChange={(event) => updateRecurring(selectedRecurring!, { recurrence: event.target.value as "weekly" | "monthly", ordinal: event.target.value === "monthly" ? 1 : null })}><option value="weekly">Every week</option><option value="monthly">Once a month</option></select></label>{recurring.recurrence === "monthly" && <label>Occurrence<select value={recurring.ordinal ?? 1} onChange={(event) => updateRecurring(selectedRecurring!, { ordinal: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}{value === 1 ? "st" : value === 2 ? "nd" : value === 3 ? "rd" : "th"}</option>)}</select></label>}<label>Day<select value={recurring.day} onChange={(event) => updateRecurring(selectedRecurring!, { day: event.target.value })}>{days.map((day) => <option key={day}>{day}</option>)}</select></label><label>Opens<select value={recurring.open} onChange={(event) => updateRecurring(selectedRecurring!, { open: event.target.value })}>{timeOptions.map((time) => <option value={time.value} key={time.value}>{time.label}</option>)}</select></label><label>Closes<select value={recurring.close} onChange={(event) => updateRecurring(selectedRecurring!, { close: event.target.value })}>{timeOptions.map((time) => <option value={time.value} key={time.value}>{time.label}</option>)}</select></label><label>Latest permitted arrival<select value={recurring.latestArrival} onChange={(event) => updateRecurring(selectedRecurring!, { latestArrival: event.target.value })}>{timeOptions.map((time) => <option value={time.value} key={time.value}>{time.label}</option>)}</select></label><div className="adminOneTimeActions"><button className="deleteAction" disabled={windows.length <= 1} onClick={deleteRecurring}>Delete recurring window</button>{selectedRecurringDate && <button onClick={cancelOccurrence}>Cancel scheduled hours on {new Date(`${selectedRecurringDate}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}</button>}<button onClick={() => { setWindows(parseSchedule(pantry)); setSelectedRecurring(null); }}>Cancel</button><button className="solidBtn" onClick={saveRecurring}>Save recurring schedule</button></div></section>}
  {selectedId !== null && <section className="adminOneTimeEditor"><div><span>{selectedId === "new" ? "NEW WINDOW" : "EDIT WINDOW"}</span><h3>One-time availability</h3></div><label>Opens<input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} /></label><label>Closes<input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} /></label><label>Latest permitted arrival<input type="datetime-local" value={draft.latestArrival} onChange={(event) => setDraft((current) => ({ ...current, latestArrival: event.target.value }))} /></label><label className="adminPauseCheck"><input type="checkbox" checked={draft.paused} onChange={(event) => setDraft((current) => ({ ...current, paused: event.target.checked }))} /> Paused</label><div className="adminOneTimeActions">{selectedId !== "new" && <button className="deleteAction" onClick={deleteWindow}>Delete window</button>}<button onClick={() => setSelectedId(null)}>Cancel</button><button className="solidBtn" onClick={saveWindow}>Save window</button></div></section>}
  <section className="monthlyReceivingCalendar"><div className="calendarMonthLabel"><strong>{today.toLocaleDateString([], { month: "long", year: "numeric" })}</strong><span>Next four weeks</span></div><header>{days.map((day) => <strong key={day}>{day}</strong>)}</header><div className="calendarMonthGrid">{dates.map((date) => {
    const day = days[(date.getDay() + 6) % 7]; const occurrence = Math.ceil(date.getDate() / 7);
    const exception = scheduleExceptions.find((item) => item.exceptionDate === adminDateKey(date));
    const recurringForDate = exception ? [] : windows.map((window, index) => ({ window, index })).filter(({ window }) => window.day === day && (window.recurrence === "weekly" || window.ordinal === occurrence));
    const oneTime = availability.filter((window) => sameDate(new Date(window.startsAt), date));
    return <div className={`calendarDate ${sameDate(date, today) ? "today" : ""}`} key={date.toISOString()}><span>{date.getDate()}</span>{exception && <button className="adminCalendarEvent cancelledEvent" onClick={() => restoreOccurrence(exception)}><b>Scheduled hours cancelled</b><small>Click to restore</small></button>}{recurringForDate.map(({ window, index }) => <button className="adminCalendarEvent recurringEvent" key={`r-${index}`} onClick={() => selectRecurring(index, adminDateKey(date))}><b>Recurring</b><small>{formatTime(window.open)}–{formatTime(window.close)}</small><small>Latest {formatTime(window.latestArrival)}</small></button>)}{oneTime.map((window) => <button className={`adminCalendarEvent oneTimeEvent ${window.paused ? "paused" : ""}`} key={window.id} onClick={() => selectWindow(window)}><b>{window.paused ? "One-time · Paused" : "One-time"}</b><small>{new Date(window.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{new Date(window.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small><small>Latest {new Date(window.latestArrival).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></button>)}</div>;
  })}</div></section></>;
}

function AdminBakeryCalendar({ bakery, availability, scheduleExceptions, organizationId, onChanged, setNotice }: { bakery: Bakery; availability: AvailabilityWindow[]; scheduleExceptions: ScheduleException[]; organizationId: number; onChanged: () => Promise<void>; setNotice: (message: string) => void }) {
  const [windows, setWindows] = useState(() => Object.entries(parseBakerySchedule(bakery)).map(([day, window]) => ({ day, readyTime: window!.readyTime, pickupDeadline: window!.pickupDeadline })));
  const [selectedRecurring, setSelectedRecurring] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedOneTime, setSelectedOneTime] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState({ startsAt: "", endsAt: "", latestArrival: "", paused: false });
  const recurring = selectedRecurring === null ? null : windows[selectedRecurring];
  function addRecurring() { setSelectedOneTime(null); setWindows((current) => [...current, { day: "Mon", readyTime: "15:00", pickupDeadline: "18:00" }]); setSelectedRecurring(windows.length); setSelectedDate(null); }
  function addOneTime() { const start = new Date(Date.now() + 86400000); start.setHours(15, 0, 0, 0); const end = new Date(start.getTime() + 3 * 3600000); setDraft({ startsAt: adminLocalInput(start), endsAt: adminLocalInput(end), latestArrival: adminLocalInput(end), paused: false }); setSelectedRecurring(null); setSelectedOneTime("new"); }
  function selectOneTime(window: AvailabilityWindow) { setSelectedRecurring(null); setSelectedOneTime(window.id); setDraft({ startsAt: adminLocalInput(new Date(window.startsAt)), endsAt: adminLocalInput(new Date(window.endsAt)), latestArrival: adminLocalInput(new Date(window.endsAt)), paused: window.paused }); }
  async function saveRecurring(next = windows) {
    const response = await fetch("/api/admin/schedule", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationType: "bakery", organizationId, windows: next }) });
    const data = await response.json().catch(() => null); if (response.ok) { setSelectedRecurring(null); await onChanged(); setNotice("Bakery pickup schedule updated."); } else setNotice(data?.error ?? "Could not save pickup schedule.");
  }
  async function saveOneTime() {
    const response = await fetch("/api/admin/availability", { method: selectedOneTime === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(selectedOneTime === "new" ? { organizationType: "bakery", organizationId } : { id: selectedOneTime }), startsAt: new Date(draft.startsAt).toISOString(), endsAt: new Date(draft.endsAt).toISOString(), latestArrival: new Date(draft.endsAt).toISOString(), paused: draft.paused }) });
    const data = await response.json().catch(() => null); if (response.ok) { setSelectedOneTime(null); await onChanged(); setNotice("One-time pickup window saved."); } else setNotice(data?.error ?? "Could not save pickup window.");
  }
  async function deleteOneTime() { if (typeof selectedOneTime !== "number" || !window.confirm("Delete this one-time pickup window?")) return; const response = await fetch(`/api/admin/availability?id=${selectedOneTime}`, { method: "DELETE" }); if (response.ok) { setSelectedOneTime(null); await onChanged(); setNotice("One-time pickup window deleted."); } }
  async function cancelDate() { if (!selectedDate || !window.confirm(`Cancel scheduled pickup hours on ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString()}?`)) return; const response = await fetch("/api/admin/schedule-exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationType: "bakery", organizationId, exceptionDate: selectedDate }) }); if (response.ok) { setSelectedRecurring(null); await onChanged(); setNotice("Scheduled pickup hours cancelled for that date."); } }
  async function restoreDate(exception: ScheduleException) { if ((await fetch(`/api/admin/schedule-exceptions?id=${exception.id}`, { method: "DELETE" })).ok) { await onChanged(); setNotice("Scheduled pickup hours restored."); } }
  const today = new Date(); today.setHours(0, 0, 0, 0); const start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const dates = Array.from({ length: 28 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  return <><div className="adminCalendarToolbar"><button onClick={addRecurring}>+ Add recurring window</button><button className="solidBtn" onClick={addOneTime}>+ Add one-time pickup window</button></div>
    {recurring && <section className="adminOneTimeEditor"><div><span>EDIT RECURRING PICKUP</span><h3>{recurring.day} pickup window</h3></div><label>Day<select value={recurring.day} onChange={(event) => setWindows((current) => current.map((item, index) => index === selectedRecurring ? { ...item, day: event.target.value } : item))}>{days.map((day) => <option key={day}>{day}</option>)}</select></label><label>Food ready<select value={recurring.readyTime} onChange={(event) => setWindows((current) => current.map((item, index) => index === selectedRecurring ? { ...item, readyTime: event.target.value } : item))}>{timeOptions.map((time) => <option value={time.value} key={time.value}>{time.label}</option>)}</select></label><label>Pickup deadline<select value={recurring.pickupDeadline} onChange={(event) => setWindows((current) => current.map((item, index) => index === selectedRecurring ? { ...item, pickupDeadline: event.target.value } : item))}>{timeOptions.map((time) => <option value={time.value} key={time.value}>{time.label}</option>)}</select></label><div className="adminOneTimeActions"><button className="deleteAction" disabled={windows.length <= 1} onClick={() => { const next = windows.filter((_, index) => index !== selectedRecurring); setWindows(next); void saveRecurring(next); }}>Delete recurring window</button>{selectedDate && <button onClick={cancelDate}>Cancel scheduled hours on {new Date(`${selectedDate}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}</button>}<button onClick={() => setSelectedRecurring(null)}>Cancel</button><button className="solidBtn" onClick={() => saveRecurring()}>Save schedule</button></div></section>}
    {selectedOneTime !== null && <section className="adminOneTimeEditor"><div><span>{selectedOneTime === "new" ? "NEW" : "EDIT"} ONE-TIME PICKUP</span><h3>Pickup availability</h3></div><label>Food ready<input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} /></label><label>Pickup deadline<input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} /></label><label className="adminPauseCheck"><input type="checkbox" checked={draft.paused} onChange={(event) => setDraft((current) => ({ ...current, paused: event.target.checked }))} /> Paused</label><div className="adminOneTimeActions">{selectedOneTime !== "new" && <button className="deleteAction" onClick={deleteOneTime}>Delete window</button>}<button onClick={() => setSelectedOneTime(null)}>Cancel</button><button className="solidBtn" onClick={saveOneTime}>Save window</button></div></section>}
    <section className="monthlyReceivingCalendar"><div className="calendarMonthLabel"><strong>{today.toLocaleDateString([], { month: "long", year: "numeric" })}</strong><span>Next four weeks</span></div><header>{days.map((day) => <strong key={day}>{day}</strong>)}</header><div className="calendarMonthGrid">{dates.map((date) => { const day = days[(date.getDay() + 6) % 7]; const exception = scheduleExceptions.find((item) => item.exceptionDate === adminDateKey(date)); const recurringRows = exception ? [] : windows.map((window, index) => ({ window, index })).filter(({ window }) => window.day === day); const dated = availability.filter((window) => sameDate(new Date(window.startsAt), date)); return <div className={`calendarDate ${sameDate(date, today) ? "today" : ""}`} key={date.toISOString()}><span>{date.getDate()}</span>{exception && <button className="adminCalendarEvent cancelledEvent" onClick={() => restoreDate(exception)}><b>Scheduled hours cancelled</b><small>Click to restore</small></button>}{recurringRows.map(({ window, index }) => <button className="adminCalendarEvent recurringEvent" key={index} onClick={() => { setSelectedOneTime(null); setSelectedRecurring(index); setSelectedDate(adminDateKey(date)); }}><b>Recurring pickup</b><small>{formatTime(window.readyTime)}–{formatTime(window.pickupDeadline)}</small></button>)}{dated.map((window) => <button className={`adminCalendarEvent oneTimeEvent ${window.paused ? "paused" : ""}`} key={window.id} onClick={() => selectOneTime(window)}><b>{window.paused ? "One-time · Paused" : "One-time pickup"}</b><small>{new Date(window.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{new Date(window.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></button>)}</div>; })}</div></section></>;
}

function sameDate(left: Date, right: Date) { return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate(); }
function adminLocalInput(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
function adminDateKey(date: Date) { return adminLocalInput(date).slice(0, 10); }

function RoutesTable({ routes, compact = false }: { routes: Route[]; compact?: boolean }) {
  if (!routes.length) return <Empty title="No route activity" body="Routes will appear after bakery pickups are reserved." />;
  return <div className={compact ? "routeRows" : "tablePanel"}>{compact ? routes.map((route) => <div className="routeRow" key={route.id}><span className={`statusDot ${route.status}`} /><div><strong>{route.bakeryName} → {route.pantryName}</strong><small>{route.driverName} · {route.scheduledArrival}</small></div><b>{route.status}</b></div>) :
    <table><thead><tr><th>Route</th><th>Driver</th><th>Scheduled arrival</th><th>Status</th></tr></thead><tbody>{routes.map((route) => <tr key={route.id}><td><strong>{route.bakeryName} → {route.pantryName}</strong></td><td>{route.driverName}</td><td>{route.scheduledArrival}</td><td><span className={`routeStatus ${route.status}`}>{route.status}</span></td></tr>)}</tbody></table>}
  </div>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return <div className="smallEmpty"><span>↗</span><div><strong>{title}</strong><p>{body}</p></div></div>;
}

function RecordModal({ kind, record, contacts, photos, saving, onClose, onSave, onChanged, setNotice }: {
  kind: PartnerKind; record?: Partner; contacts: OrganizationContact[]; photos: AccessPhoto[]; saving: boolean; onClose: () => void;
  onSave: (e: FormEvent<HTMLFormElement>) => void;
  onChanged: () => Promise<void>; setNotice: (message: string) => void;
}) {
  const initialDays = record?.recurringDays.split(",").map((day) => day.trim()).filter(Boolean) ?? [];
  const existingBakerySchedule = kind === "bakery" && record ? parseBakerySchedule(record as Bakery) : {};
  const existingBusinessHours = kind === "bakery" && record ? parseBakeryBusinessHours(record as Bakery) : {};
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
        <label className="wide">{kind === "pantry" ? "Delivery address" : "Street address"}<input name="address" required defaultValue={record?.address} placeholder="123 Main Street, Boston, MA" /></label>
        <label className="wide">{kind === "pantry" ? "Drop-off instructions" : "Pickup instructions"} <small>Details that help a driver find the exact {kind === "pantry" ? "receiving" : "pickup"} point.</small><textarea name="dropoffInstructions" rows={3} defaultValue={record?.dropoffInstructions ?? ""} placeholder={kind === "pantry" ? "Example: Community fridge is in the church parking lot" : "Example: Use the side entrance and ask at the pickup counter"} /></label>
        <label>Latitude <input name="latitude" type="number" step="any" defaultValue={record?.latitude ?? ""} placeholder="42.3601" /></label>
        <label>Longitude <input name="longitude" type="number" step="any" defaultValue={record?.longitude ?? ""} placeholder="-71.0589" /></label>
        <label>Contact name <small>Name of the primary organizational contact for BakedBoston administrators.</small><input name="contactName" required defaultValue={record?.contactName} /></label>
        <label>Contact email <small>Email of the primary organizational contact.</small><input name="contactEmail" type="email" required defaultValue={record?.contactEmail} /></label>
        <label>Contact phone number <small>Phone number of the primary organizational contact.</small><input name="contactPhone" type="tel" required defaultValue={record?.contactPhone} /></label>
        <label>Business phone number <small>Visible to drivers and rescue partners for calls during business hours.</small><input name="businessPhone" type="tel" defaultValue={record?.businessPhone} /></label>
        <label>Notification contact <small>Email address or phone number monitored for upcoming delivery confirmations and notifications.</small><input name="notificationPhone" type="text" defaultValue={record?.notificationPhone} /></label>
        {record && <div className="wide"><ContactManager organizationType={kind} organizationId={record.id} contacts={contacts} onChanged={onChanged} setNotice={setNotice} /></div>}
        {kind === "bakery" ? <>{record && <div className="wide"><AccessPhotoManager kind={kind} organizationId={record.id} photos={photos} onChanged={onChanged} setNotice={setNotice} /></div>}<fieldset className="wide bakeryHours"><legend>Business hours and pickup availability by day</legend><p>Business hours determine when opening reminders begin. Food-ready time and pickup deadline define the separate surplus pickup window.</p>
          {days.map((day) => {
            const enabled = bakeryDays.includes(day);
            const daySchedule = existingBakerySchedule[day];
            return <div className={`bakeryDayRow ${enabled ? "enabled" : ""}`} key={day}>
              <label className="dayToggle"><input type="checkbox" name={`bakeryDay_${day}`} checked={enabled} onChange={(event) => setBakeryDays((current) => event.target.checked ? [...current, day] : current.filter((currentDay) => currentDay !== day))} /><span>{day}</span></label>
              <label>Business opens<input name={`bakeryBusinessOpen_${day}`} type="text" inputMode="text" defaultValue={existingBusinessHours[day]?.open ? formatTime(existingBusinessHours[day].open) : daySchedule?.readyTime ? formatTime(daySchedule.readyTime) : ""} placeholder="7:00 AM" disabled={!enabled} required={enabled} /></label>
              <label>Business closes<input name={`bakeryBusinessClose_${day}`} type="text" inputMode="text" defaultValue={existingBusinessHours[day]?.close ? formatTime(existingBusinessHours[day].close) : daySchedule?.pickupDeadline ? formatTime(daySchedule.pickupDeadline) : ""} placeholder="6:00 PM" disabled={!enabled} required={enabled} /></label>
              <label>Food ready<input name={`bakeryReady_${day}`} type="text" inputMode="text" defaultValue={daySchedule?.readyTime ? formatTime(daySchedule.readyTime) : ""} placeholder="3:00 PM" disabled={!enabled} required={enabled} /></label>
              <label>Pickup deadline<input name={`bakeryDeadline_${day}`} type="text" inputMode="text" defaultValue={daySchedule?.pickupDeadline ? formatTime(daySchedule.pickupDeadline) : ""} placeholder="6:00 PM" disabled={!enabled} required={enabled} /></label>
            </div>;
          })}
        </fieldset></> :
          <>{record && <div className="wide"><AccessPhotoManager kind={kind} organizationId={record.id} photos={photos} onChanged={onChanged} setNotice={setNotice} /></div>}<fieldset className="wide receivingWindows"><legend>Receiving schedule</legend><p>Add as many windows as needed. A pantry can have two windows on one day or rules such as “2nd Saturday monthly.”</p>
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

function AccessPhotoManager({ kind, organizationId, photos, onChanged, setNotice }: {
  kind: PartnerKind; organizationId: number; photos: AccessPhoto[]; onChanged: () => Promise<void>; setNotice: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  async function upload() {
    if (!photo) return;
    setUploading(true);
    const formData = new FormData();
    formData.set("organizationId", String(organizationId));
    formData.set("organizationType", kind);
    formData.set("photo", photo);
    formData.set("caption", caption);
    const response = await fetch("/api/access-photos", { method: "POST", body: formData });
    const data = await response.json().catch(() => null);
    setUploading(false);
    if (response.ok) { setPhoto(null); setCaption(""); await onChanged(); setNotice(`${kind === "pantry" ? "Pantry" : "Bakery"} access photo added.`); }
    else setNotice(data?.error ?? "Could not upload photo.");
  }
  async function remove(id: number) {
    const response = await fetch(`/api/access-photos?id=${id}&organizationType=${kind}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    if (response.ok) { await onChanged(); setNotice(`${kind === "pantry" ? "Pantry" : "Bakery"} access photo deleted.`); }
    else setNotice(data?.error ?? "Could not delete photo.");
  }
  return <fieldset className="pantryPhotos"><legend>{kind === "pantry" ? "Pantry" : "Bakery"} access photos <small>Optional</small></legend>
    <p>Show drivers how to locate the exact {kind === "pantry" ? "drop-off" : "pickup"} point. These photos are not included in the onboarding email.</p>
    {photos.length > 0 && <div className="pantryPhotoGrid">{photos.map((photo) => <figure key={photo.id}><img src={photo.imageUrl} alt={photo.caption || "Pantry access"} /><figcaption>{photo.caption || "Pantry access photo"}</figcaption><button type="button" onClick={() => remove(photo.id)}>Delete</button></figure>)}</div>}
    <div className="pantryPhotoUpload"><label>Photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></label><label>Caption<input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Example: Enter from the rear parking lot" /></label><button type="button" onClick={upload} disabled={uploading || !photo}>{uploading ? "Uploading…" : "+ Add photo"}</button></div>
  </fieldset>;
}
