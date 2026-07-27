import { createHash } from "crypto";
import { and, count, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  availabilityPauses,
  availabilityWindows,
  bakeryAccessPhotos,
  bakeries,
  mobileSessions,
  organizationContacts,
  pantries,
  pantryAccessPhotos,
  partnerAccounts,
  rescueRoutes,
  scheduleExceptions,
} from "../../../../db/schema";
import { writeAudit } from "../../../audit";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

async function currentAccount(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  if (!token) return null;
  const db = getDb();
  const [session] = await db.select().from(mobileSessions).where(and(
    eq(mobileSessions.tokenHash, tokenHash(token)),
    gt(mobileSessions.expiresAt, new Date()),
  )).limit(1);
  if (!session || session.role === "driver") return null;
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, session.accountId)).limit(1);
  return account?.active && account.organizationType === session.role ? account : null;
}

export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  const db = getDb();
  const organization = account.organizationType === "bakery"
    ? (await db.select().from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1))[0]
    : (await db.select().from(pantries).where(eq(pantries.id, account.organizationId)).limit(1))[0];
  if (!organization) return Response.json({ error: "Organization unavailable." }, { status: 404 });

  const [contacts, windows, pauses, exceptions, routes, photos] = await Promise.all([
    db.select().from(organizationContacts).where(and(
      eq(organizationContacts.organizationType, account.organizationType),
      eq(organizationContacts.organizationId, account.organizationId),
    )),
    db.select().from(availabilityWindows).where(and(
      eq(availabilityWindows.organizationType, account.organizationType),
      eq(availabilityWindows.organizationId, account.organizationId),
    )).orderBy(desc(availabilityWindows.startsAt)),
    db.select().from(availabilityPauses).where(and(
      eq(availabilityPauses.organizationType, account.organizationType),
      eq(availabilityPauses.organizationId, account.organizationId),
    )).orderBy(desc(availabilityPauses.createdAt)),
    db.select().from(scheduleExceptions).where(and(
      eq(scheduleExceptions.organizationType, account.organizationType),
      eq(scheduleExceptions.organizationId, account.organizationId),
    )),
    account.organizationType === "bakery"
      ? db.select().from(rescueRoutes).where(eq(rescueRoutes.bakeryName, organization.name)).orderBy(desc(rescueRoutes.createdAt))
      : db.select().from(rescueRoutes).where(eq(rescueRoutes.pantryName, organization.name)).orderBy(desc(rescueRoutes.createdAt)),
    account.organizationType === "bakery"
      ? db.select().from(bakeryAccessPhotos).where(eq(bakeryAccessPhotos.bakeryId, organization.id)).orderBy(desc(bakeryAccessPhotos.createdAt))
      : db.select().from(pantryAccessPhotos).where(eq(pantryAccessPhotos.pantryId, organization.id)).orderBy(desc(pantryAccessPhotos.createdAt)),
  ]);

  return Response.json({
    account: {
      accountEmail: account.accountEmail,
      administratorName: account.administratorName,
      contactEmail: account.contactEmail,
      contactPhone: account.contactPhone,
    },
    organization,
    contacts,
    availabilityWindows: windows,
    availabilityPauses: pauses,
    scheduleExceptions: exceptions,
    routes,
    photos,
  });
}

export async function POST(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const db = getDb();
    if (body.action === "add-contact") {
      const contact = { name: required(body.name, "Contact name"), email: validEmail(body.email), phone: required(body.phone, "Contact phone number") };
      const [{ value }] = await db.select({ value: count() }).from(organizationContacts).where(and(eq(organizationContacts.organizationType, account.organizationType), eq(organizationContacts.organizationId, account.organizationId)));
      const [record] = await db.insert(organizationContacts).values({ organizationType: account.organizationType, organizationId: account.organizationId, ...contact, isPrimary: Number(value) === 0 }).returning();
      await audit(account, "added organizational contact", `${contact.name} · ${contact.email}`);
      return Response.json({ record }, { status: 201 });
    }
    if (body.action === "cancel-occurrence") {
      const exceptionDate = validDateOnly(body.exceptionDate);
      const existing = await db.select().from(scheduleExceptions).where(and(
        eq(scheduleExceptions.organizationType, account.organizationType),
        eq(scheduleExceptions.organizationId, account.organizationId),
        eq(scheduleExceptions.exceptionDate, exceptionDate),
      )).limit(1);
      const record = existing[0] ?? (await db.insert(scheduleExceptions).values({ organizationType: account.organizationType, organizationId: account.organizationId, exceptionDate }).returning())[0];
      await audit(account, "cancelled scheduled hours for one date", exceptionDate);
      return Response.json({ record });
    }
    const startsAt = validDateTime(body.startsAt, "Opening time");
    const endsAt = validDateTime(body.endsAt, "Closing time");
    const latestArrival = validDateTime(body.latestArrival, "Latest permitted arrival");
    validateWindow(startsAt, endsAt, latestArrival);
    const [record] = await db.insert(availabilityWindows).values({ organizationType: account.organizationType, organizationId: account.organizationId, startsAt, endsAt, latestArrival, paused: false }).returning();
    await audit(account, "created one-time availability window", `${startsAt.toISOString()}–${endsAt.toISOString()}`);
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update availability." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const db = getDb();
    if (body.action === "update-profile") {
      const accountEmail = validEmail(body.accountEmail);
      const address = required(body.address, "Address");
      const organizationUpdate = { address, dropoffInstructions: clean(body.dropoffInstructions), businessPhone: clean(body.businessPhone), notificationPhone: clean(body.notificationPhone) };
      const [duplicate] = await db.select({ id: partnerAccounts.id }).from(partnerAccounts).where(and(eq(partnerAccounts.accountEmail, accountEmail), ne(partnerAccounts.id, account.id))).limit(1);
      if (duplicate) throw new Error("That account email is already in use.");
      await db.update(partnerAccounts).set({ accountEmail, updatedAt: new Date() }).where(eq(partnerAccounts.id, account.id));
      if (account.organizationType === "bakery") await db.update(bakeries).set(organizationUpdate).where(eq(bakeries.id, account.organizationId));
      else await db.update(pantries).set(organizationUpdate).where(eq(pantries.id, account.organizationId));
      await audit(account, "updated organization profile", "Account email, address, directions, or organization phone channels updated");
      return Response.json({ ok: true });
    }
    if (body.action === "make-primary-contact") {
      const id = Number(body.id);
      const [contact] = await db.select().from(organizationContacts).where(eq(organizationContacts.id, id)).limit(1);
      if (!contact || contact.organizationType !== account.organizationType || contact.organizationId !== account.organizationId) throw new Error("Contact not found.");
      await db.update(organizationContacts).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(organizationContacts.organizationType, account.organizationType), eq(organizationContacts.organizationId, account.organizationId)));
      await db.update(organizationContacts).set({ isPrimary: true, updatedAt: new Date() }).where(eq(organizationContacts.id, id));
      const primary = { contactName: contact.name, contactEmail: contact.email, contactPhone: contact.phone };
      if (account.organizationType === "bakery") await db.update(bakeries).set(primary).where(eq(bakeries.id, account.organizationId));
      else await db.update(pantries).set(primary).where(eq(pantries.id, account.organizationId));
      await audit(account, "changed primary organizational contact", contact.name);
      return Response.json({ ok: true });
    }
    if (body.action === "save-schedule") {
      const windows = Array.isArray(body.windows) ? body.windows as Array<Record<string, unknown>> : [];
      if (!windows.length) throw new Error("Add at least one recurring window.");
      if (account.organizationType === "bakery") {
        const normalized = windows.map((window) => ({ day: validDay(window.day), readyTime: validTime(window.readyTime), pickupDeadline: validTime(window.pickupDeadline) }));
        for (const window of normalized) if (window.readyTime >= window.pickupDeadline) throw new Error(`${window.day}: pickup deadline must be later than food-ready time.`);
        await db.update(bakeries).set({
          recurringDays: normalized.map((window) => window.day).join(", "),
          readyTime: JSON.stringify(Object.fromEntries(normalized.map((window) => [window.day, window.readyTime]))),
          arrivalDeadline: JSON.stringify(Object.fromEntries(normalized.map((window) => [window.day, window.pickupDeadline]))),
        }).where(eq(bakeries.id, account.organizationId));
      } else {
        const normalized = windows.map((window) => ({
          recurrence: window.recurrence === "monthly" ? "monthly" : "weekly",
          day: validDay(window.day),
          ordinal: window.recurrence === "monthly" ? validOrdinal(window.ordinal) : null,
          open: validTime(window.open), close: validTime(window.close), latestArrival: validTime(window.latestArrival),
        }));
        for (const window of normalized) {
          if (window.open >= window.close) throw new Error(`${window.day}: closing time must be later than opening time.`);
          if (window.latestArrival < window.open || window.latestArrival > window.close) throw new Error(`${window.day}: latest arrival must fall inside the window.`);
        }
        await db.update(pantries).set({
          recurringDays: [...new Set(normalized.map((window) => window.day))].join(", "),
          openTime: JSON.stringify(normalized.map(({ recurrence, day, ordinal, open }) => ({ recurrence, day, ordinal, time: open }))),
          closeTime: JSON.stringify(normalized.map(({ recurrence, day, ordinal, close }) => ({ recurrence, day, ordinal, time: close }))),
          latestArrival: JSON.stringify(normalized.map(({ recurrence, day, ordinal, latestArrival }) => ({ recurrence, day, ordinal, time: latestArrival }))),
        }).where(eq(pantries.id, account.organizationId));
      }
      await audit(account, `updated ${account.organizationType} schedule`, "Recurring availability updated in mobile portal");
      return Response.json({ ok: true });
    }
    const id = Number(body.id);
    const [window] = await db.select().from(availabilityWindows).where(eq(availabilityWindows.id, id)).limit(1);
    if (!window || window.organizationType !== account.organizationType || window.organizationId !== account.organizationId) throw new Error("Availability window not found.");
    const startsAt = validDateTime(body.startsAt, "Opening time");
    const endsAt = validDateTime(body.endsAt, "Closing time");
    const latestArrival = validDateTime(body.latestArrival, "Latest permitted arrival");
    validateWindow(startsAt, endsAt, latestArrival);
    const [record] = await db.update(availabilityWindows).set({ startsAt, endsAt, latestArrival }).where(eq(availabilityWindows.id, id)).returning();
    await audit(account, "updated one-time availability window", String(id));
    return Response.json({ record });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save schedule." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  const type = url.searchParams.get("type");
  const db = getDb();
  if (type === "contact") {
    const [contact] = await db.select().from(organizationContacts).where(eq(organizationContacts.id, id)).limit(1);
    if (!contact || contact.organizationType !== account.organizationType || contact.organizationId !== account.organizationId) return Response.json({ error: "Contact not found." }, { status: 404 });
    const [{ value }] = await db.select({ value: count() }).from(organizationContacts).where(and(eq(organizationContacts.organizationType, account.organizationType), eq(organizationContacts.organizationId, account.organizationId)));
    if (Number(value) <= 1) return Response.json({ error: "Every organization must retain at least one primary contact." }, { status: 409 });
    await db.delete(organizationContacts).where(eq(organizationContacts.id, id));
    if (contact.isPrimary) {
      const [replacement] = await db.select().from(organizationContacts).where(and(eq(organizationContacts.organizationType, account.organizationType), eq(organizationContacts.organizationId, account.organizationId))).limit(1);
      if (replacement) {
        await db.update(organizationContacts).set({ isPrimary: true, updatedAt: new Date() }).where(eq(organizationContacts.id, replacement.id));
        const primary = { contactName: replacement.name, contactEmail: replacement.email, contactPhone: replacement.phone };
        if (account.organizationType === "bakery") await db.update(bakeries).set(primary).where(eq(bakeries.id, account.organizationId));
        else await db.update(pantries).set(primary).where(eq(pantries.id, account.organizationId));
      }
    }
    await audit(account, "deleted organizational contact", contact.name);
  } else if (type === "exception") {
    const [record] = await db.select().from(scheduleExceptions).where(eq(scheduleExceptions.id, id)).limit(1);
    if (!record || record.organizationType !== account.organizationType || record.organizationId !== account.organizationId) return Response.json({ error: "Cancellation not found." }, { status: 404 });
    await db.delete(scheduleExceptions).where(eq(scheduleExceptions.id, id));
    await audit(account, "restored scheduled hours for one date", record.exceptionDate);
  } else {
    const [record] = await db.select().from(availabilityWindows).where(eq(availabilityWindows.id, id)).limit(1);
    if (!record || record.organizationType !== account.organizationType || record.organizationId !== account.organizationId) return Response.json({ error: "Availability window not found." }, { status: 404 });
    await db.delete(availabilityWindows).where(eq(availabilityWindows.id, id));
    await audit(account, "deleted one-time availability window", String(id));
  }
  return Response.json({ ok: true });
}

function validDay(value: unknown) { const day = String(value ?? ""); if (!["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(day)) throw new Error("Choose a valid day."); return day; }
function validTime(value: unknown) { const time = String(value ?? ""); if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Enter a valid time."); return time; }
function validOrdinal(value: unknown) { const ordinal = Number(value); if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 5) throw new Error("Choose a monthly occurrence."); return ordinal; }
function validDateOnly(value: unknown) { const date = String(value ?? ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid date."); return date; }
function validDateTime(value: unknown, label: string) { const date = new Date(String(value ?? "")); if (!Number.isFinite(date.getTime())) throw new Error(`${label} is required.`); return date; }
function validateWindow(start: Date, end: Date, latest: Date) { if (end <= start) throw new Error("Closing time must be later than opening time."); if (latest < start || latest > end) throw new Error("Latest arrival must fall inside the availability window."); }
async function audit(account: typeof partnerAccounts.$inferSelect, action: string, details: string) { await writeAudit({ actorType: "partner", actorId: account.id, actorName: account.accountEmail, action, entityType: account.organizationType, entityId: account.organizationId, entityName: account.accountEmail, details }); }
function clean(value: unknown) { return String(value ?? "").trim(); }
function required(value: unknown, label: string) { const result = clean(value); if (!result) throw new Error(`${label} is required.`); return result; }
function validEmail(value: unknown) { const email = required(value, "Email").toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address."); return email; }
