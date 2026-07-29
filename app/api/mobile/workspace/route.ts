import { createHash } from "crypto";
import { and, count, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  availabilityPauses,
  availabilityWindows,
  bakeryAccessPhotos,
  bakeryPickupOccurrences,
  bakeries,
  inAppNotifications,
  mobileSessions,
  organizationContacts,
  pantries,
  pantryAccessPhotos,
  pantryImpactPhotos,
  partnerAccounts,
  rescueRoutes,
  routeOffers,
  scheduleExceptions,
} from "../../../../db/schema";
import { writeAudit } from "../../../audit";
import { matchConfirmedPickup } from "../../../pickup-matching";
import { replaceOperationalNotification } from "../../../operational-notifications";
import { firstCommitmentReminder, firstSpontaneousCommitmentReminder, nextCommitmentReminder } from "../../../bakery-commitments";
import { earliestUnresolvedPickup, pickupWindowDescription } from "../../../pickup-ordering";

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

  const [contacts, windows, pauses, exceptions, routes, photos, impactPhotos, pickupOccurrences, notifications] = await Promise.all([
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
    account.organizationType === "pantry"
      ? db.select().from(pantryImpactPhotos).where(eq(pantryImpactPhotos.pantryId, organization.id)).orderBy(desc(pantryImpactPhotos.createdAt))
      : Promise.resolve([]),
    account.organizationType === "bakery"
      ? db.select().from(bakeryPickupOccurrences).where(eq(bakeryPickupOccurrences.bakeryId, organization.id)).orderBy(desc(bakeryPickupOccurrences.pickupWindowStartsAt))
      : Promise.resolve([]),
    db.select().from(inAppNotifications).where(and(
      eq(inAppNotifications.recipientType, account.organizationType),
      eq(inAppNotifications.recipientId, organization.id),
    )).orderBy(desc(inAppNotifications.createdAt)),
  ]);
  const acceptedOffers = account.organizationType === "bakery"
    ? pickupOccurrences.length
      ? await db.select().from(routeOffers).where(and(
        inArray(routeOffers.pickupOccurrenceId, pickupOccurrences.map((occurrence) => occurrence.id)),
        eq(routeOffers.status, "accepted"),
      ))
      : []
    : await db.select().from(routeOffers).where(and(
      eq(routeOffers.pantryId, organization.id),
      eq(routeOffers.status, "accepted"),
    ));
  const nextArrival = acceptedOffers
    .filter((offer) => account.organizationType === "bakery"
      ? ["reserved", "en_route_to_bakery"].includes(offer.deliveryStage)
      : offer.deliveryStage !== "completed")
    .map((offer) => account.organizationType === "bakery" ? offer.estimatedBakeryArrival : offer.estimatedPantryArrival)
    .filter((arrival) => arrival.getTime() >= Date.now() - 15 * 60_000)
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;

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
    impactPhotos,
    pickupOccurrences,
    notifications,
    nextArrival: nextArrival?.toISOString() ?? null,
  });
}

export async function POST(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const db = getDb();
    if (body.action === "pause-availability") {
      const endsAt = validDateTime(body.endsAt, "Pause end time");
      const [record] = await db.insert(availabilityPauses).values({
        organizationType: account.organizationType,
        organizationId: account.organizationId,
        endsAt,
      }).returning();
      await audit(account, "paused scheduled availability", endsAt.toISOString());
      return Response.json({ record }, { status: 201 });
    }
    if (body.action === "create-pickup-occurrence") {
      if (account.organizationType !== "bakery") throw new Error("Only bakery accounts can create pickup occurrences.");
      const serviceDate = validDateOnly(body.serviceDate);
      const pickupWindowStartsAt = validDateTime(body.pickupWindowStartsAt, "Pickup window start");
      const pickupDeadline = validDateTime(body.pickupDeadline, "Pickup deadline");
      if (pickupDeadline <= pickupWindowStartsAt) throw new Error("Pickup deadline must be later than the pickup start.");
      const [existing] = await db.select().from(bakeryPickupOccurrences).where(and(
        eq(bakeryPickupOccurrences.bakeryId, account.organizationId),
        eq(bakeryPickupOccurrences.pickupWindowStartsAt, pickupWindowStartsAt),
      )).limit(1);
      const [bakery] = await db.select().from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1);
      const record = existing ?? (await db.insert(bakeryPickupOccurrences).values({
        bakeryId: account.organizationId, serviceDate, pickupWindowStartsAt, pickupDeadline,
        commitmentReminderDueAt: bakery ? firstCommitmentReminder(bakery, serviceDate, pickupWindowStartsAt) : null,
      }).returning())[0];
      return Response.json({ record }, { status: existing ? 200 : 201 });
    }
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
    const serviceMode = validServiceMode(body.serviceMode, account.organizationType);
    validateWindow(startsAt, endsAt, latestArrival);
    const [record] = await db.insert(availabilityWindows).values({ organizationType: account.organizationType, organizationId: account.organizationId, startsAt, endsAt, latestArrival, serviceMode, paused: false }).returning();
    if (account.organizationType === "bakery") {
      await db.insert(bakeryPickupOccurrences).values({
        bakeryId: account.organizationId,
        serviceDate: easternDate(startsAt),
        pickupWindowStartsAt: startsAt,
        pickupDeadline: endsAt,
        commitmentReminderDueAt: firstSpontaneousCommitmentReminder(startsAt),
      }).onConflictDoNothing();
    }
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
    if (body.action === "update-pickup-occurrence") {
      if (account.organizationType !== "bakery") throw new Error("Only bakery accounts can confirm pickups.");
      const id = Number(body.id);
      const status = String(body.status ?? "");
      if (!Number.isInteger(id) || !["confirmed", "decision_deferred", "insufficient_food"].includes(status)) throw new Error("Choose a valid pickup response.");
      const [existing] = await db.select().from(bakeryPickupOccurrences).where(and(
        eq(bakeryPickupOccurrences.id, id),
        eq(bakeryPickupOccurrences.bakeryId, account.organizationId),
      )).limit(1);
      if (!existing) throw new Error("Pickup occurrence not found.");
      const earliest = await earliestUnresolvedPickup(account.organizationId);
      if (earliest && earliest.id !== existing.id) {
        return Response.json({
          error: `Please finish the earlier ${pickupWindowDescription(earliest.pickupWindowStartsAt, earliest.pickupDeadline)} pickup window before updating this one.`,
        }, { status: 409 });
      }
      const [record] = await db.update(bakeryPickupOccurrences).set({
        status: status as "confirmed" | "decision_deferred" | "insufficient_food",
        confirmedAt: status === "confirmed" ? new Date() : null,
        commitmentReminderDueAt: status === "decision_deferred" ? nextCommitmentReminder(existing.pickupWindowStartsAt) : null,
        updatedAt: new Date(),
      }).where(eq(bakeryPickupOccurrences.id, id)).returning();
      let matching = { matchedRequests: 0, offered: false };
      if (status === "confirmed") {
        const [bakery] = await db.select().from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1);
        if (bakery) matching = await matchConfirmedPickup(record, bakery.name, bakery.latitude, bakery.longitude);
      } else {
        await db.update(routeOffers).set({ status: "withdrawn", respondedAt: new Date() }).where(and(
          eq(routeOffers.pickupOccurrenceId, record.id),
          inArray(routeOffers.status, ["queued", "offered"]),
        ));
      }
      await replaceOperationalNotification({
        recipientType: "bakery",
        recipientId: account.organizationId,
        eventType: status === "confirmed" ? "pickup_confirmed" : status === "insufficient_food" ? "pickup_unavailable" : "pickup_decision_deferred",
        threadKey: `pickup:${record.id}`,
        title: status === "confirmed" ? "Today’s pickup is confirmed" : status === "insufficient_food" ? "No pickup planned today" : "Pickup decision postponed",
        body: status === "confirmed"
          ? "You confirmed that food will be available during this pickup window. Drivers can now reserve a route that includes it."
          : status === "insufficient_food"
            ? "You marked today’s pickup unavailable. You can change this decision from the availability card."
            : "This pickup is not available to drivers until food availability is confirmed.",
      });
      await audit(account, `set pickup occurrence to ${status.replaceAll("_", " ")}`, record.serviceDate);
      return Response.json({ record, matching });
    }
    if (body.action === "set-one-time-paused") {
      const id = Number(body.id);
      const [window] = await db.select().from(availabilityWindows).where(eq(availabilityWindows.id, id)).limit(1);
      if (!window || window.organizationType !== account.organizationType || window.organizationId !== account.organizationId) throw new Error("Availability window not found.");
      const [record] = await db.update(availabilityWindows).set({ paused: Boolean(body.paused) }).where(eq(availabilityWindows.id, id)).returning();
      await audit(account, body.paused ? "paused one-time availability window" : "resumed one-time availability window", String(id));
      return Response.json({ record });
    }
    if (body.action === "update-profile") {
      const accountEmail = validEmail(body.accountEmail);
      const address = required(body.address, "Address");
      const [duplicate] = await db.select({ id: partnerAccounts.id }).from(partnerAccounts).where(and(eq(partnerAccounts.accountEmail, accountEmail), ne(partnerAccounts.id, account.id))).limit(1);
      if (duplicate) throw new Error("That account email is already in use.");
      await db.update(partnerAccounts).set({ accountEmail, updatedAt: new Date() }).where(eq(partnerAccounts.id, account.id));
      const channels = { address, dropoffInstructions: clean(body.dropoffInstructions), businessPhone: clean(body.businessPhone), notificationPhone: clean(body.notificationPhone) };
      if (account.organizationType === "bakery") {
        const [organization] = await db.select({ address: bakeries.address }).from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1);
        const addressChanged = organization?.address !== address;
        await db.update(bakeries).set({
          ...channels,
          ...(addressChanged ? { formattedAddress: "", googlePlaceId: "", addressValidationStatus: "unvalidated" as const, latitude: null, longitude: null } : {}),
        }).where(eq(bakeries.id, account.organizationId));
      } else {
        const [organization] = await db.select({ address: pantries.address }).from(pantries).where(eq(pantries.id, account.organizationId)).limit(1);
        const addressChanged = organization?.address !== address;
        await db.update(pantries).set({
          ...channels,
          ...(addressChanged ? { formattedAddress: "", googlePlaceId: "", addressValidationStatus: "unvalidated" as const, latitude: null, longitude: null } : {}),
        }).where(eq(pantries.id, account.organizationId));
      }
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
        const normalized = windows.map((window) => ({
          day: validDay(window.day),
          businessOpen: validTime(window.businessOpen),
          businessClose: validTime(window.businessClose),
          readyTime: validTime(window.readyTime),
          pickupDeadline: validTime(window.pickupDeadline),
        }));
        for (const window of normalized) {
          if (window.businessOpen >= window.businessClose) throw new Error(`${window.day}: business closing time must be later than opening time.`);
          if (window.readyTime >= window.pickupDeadline) throw new Error(`${window.day}: pickup deadline must be later than food-ready time.`);
          if (window.readyTime < window.businessOpen || window.pickupDeadline > window.businessClose) throw new Error(`${window.day}: pickup hours must fall within business hours.`);
        }
        await db.update(bakeries).set({
          recurringDays: normalized.map((window) => window.day).join(", "),
          businessOpenTime: JSON.stringify(Object.fromEntries(normalized.map((window) => [window.day, window.businessOpen]))),
          businessCloseTime: JSON.stringify(Object.fromEntries(normalized.map((window) => [window.day, window.businessClose]))),
          readyTime: JSON.stringify(Object.fromEntries(normalized.map((window) => [window.day, window.readyTime]))),
          arrivalDeadline: JSON.stringify(Object.fromEntries(normalized.map((window) => [window.day, window.pickupDeadline]))),
        }).where(eq(bakeries.id, account.organizationId));
      } else {
        const normalized = windows.map((window) => ({
          recurrence: window.recurrence === "monthly" ? "monthly" : "weekly",
          day: validDay(window.day),
          ordinal: window.recurrence === "monthly" ? validOrdinal(window.ordinal) : null,
          open: validTime(window.open), close: validTime(window.close), latestArrival: validTime(window.latestArrival),
          serviceMode: validServiceMode(window.serviceMode, "pantry"),
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
          serviceModes: JSON.stringify(normalized.map(({ recurrence, day, ordinal, serviceMode }) => ({ recurrence, day, ordinal, mode: serviceMode }))),
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
    const serviceMode = validServiceMode(body.serviceMode, account.organizationType);
    validateWindow(startsAt, endsAt, latestArrival);
    const [record] = await db.update(availabilityWindows).set({ startsAt, endsAt, latestArrival, serviceMode }).where(eq(availabilityWindows.id, id)).returning();
    if (account.organizationType === "bakery") {
      const commitmentReminderDueAt = firstSpontaneousCommitmentReminder(startsAt);
      const [updatedOccurrence] = await db.update(bakeryPickupOccurrences).set({
        serviceDate: easternDate(startsAt),
        pickupWindowStartsAt: startsAt,
        pickupDeadline: endsAt,
        commitmentReminderDueAt,
        updatedAt: new Date(),
      }).where(and(
        eq(bakeryPickupOccurrences.bakeryId, account.organizationId),
        eq(bakeryPickupOccurrences.pickupWindowStartsAt, window.startsAt),
      )).returning();
      if (!updatedOccurrence) {
        await db.insert(bakeryPickupOccurrences).values({
          bakeryId: account.organizationId,
          serviceDate: easternDate(startsAt),
          pickupWindowStartsAt: startsAt,
          pickupDeadline: endsAt,
          commitmentReminderDueAt,
        }).onConflictDoNothing();
      }
    }
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
  if (type === "pause") {
    const [record] = await db.select().from(availabilityPauses).where(eq(availabilityPauses.id, id)).limit(1);
    if (!record || record.organizationType !== account.organizationType || record.organizationId !== account.organizationId) return Response.json({ error: "Pause not found." }, { status: 404 });
    await db.delete(availabilityPauses).where(eq(availabilityPauses.id, id));
    await audit(account, "resumed scheduled availability", String(id));
  } else if (type === "contact") {
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
    if (account.organizationType === "bakery") {
      await db.delete(bakeryPickupOccurrences).where(and(
        eq(bakeryPickupOccurrences.bakeryId, account.organizationId),
        eq(bakeryPickupOccurrences.pickupWindowStartsAt, record.startsAt),
      ));
    }
    await audit(account, "deleted one-time availability window", String(id));
  }
  return Response.json({ ok: true });
}

function validDay(value: unknown) { const day = String(value ?? ""); if (!["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(day)) throw new Error("Choose a valid day."); return day; }
function validTime(value: unknown) { const time = String(value ?? ""); if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Enter a valid time."); return time; }
function validOrdinal(value: unknown) { const ordinal = Number(value); if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 5) throw new Error("Choose a monthly occurrence."); return ordinal; }
function easternDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validDateOnly(value: unknown) { const date = String(value ?? ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid date."); return date; }
function validDateTime(value: unknown, label: string) { const date = new Date(String(value ?? "")); if (!Number.isFinite(date.getTime())) throw new Error(`${label} is required.`); return date; }
function validateWindow(start: Date, end: Date, latest: Date) { if (end <= start) throw new Error("Closing time must be later than opening time."); if (latest < start || latest > end) throw new Error("Latest arrival must fall inside the availability window."); }
function validServiceMode(value: unknown, type: string) { if (type === "bakery") return "staffed" as const; if (value !== "staffed" && value !== "unattended") throw new Error("Choose whether the receiving window is staffed or unattended."); return value; }
async function audit(account: typeof partnerAccounts.$inferSelect, action: string, details: string) { await writeAudit({ actorType: "partner", actorId: account.id, actorName: account.accountEmail, action, entityType: account.organizationType, entityId: account.organizationId, entityName: account.accountEmail, details }); }
function clean(value: unknown) { return String(value ?? "").trim(); }
function required(value: unknown, label: string) { const result = clean(value); if (!result) throw new Error(`${label} is required.`); return result; }
function validEmail(value: unknown) { const email = required(value, "Email").toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address."); return email; }
