import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { adminAccounts, adminInvitations, auditLog, availabilityPauses, availabilityWindows, bakeries, bakeryAccessPhotos, bakeryPickupOccurrences, driverAccounts, driverRideRequests, inAppNotifications, mobileSessions, organizationContacts, pantries, pantryAccessPhotos, pantryImpactPhotos, partnerAccounts, partnerInvitations, pushDevices, rescueRoutes, routeOffers, scheduleExceptions, supportReportMessages, supportReports } from "../../../db/schema";
import { getAdministrator, isAdministrator } from "../../admin-auth";
import { writeAudit } from "../../audit";
import { sendAccountStatusEmail } from "../../account-email";

async function authorized() {
  return isAdministrator();
}

export async function GET() {
  if (!(await authorized())) return Response.json({ error: "Sign in required" }, { status: 401 });

  const db = getDb();
  const [bakeryRows, pantryRows, routeRows, accountRows, invitationRows, administratorRows, adminInvitationRows, auditRows, contactRows, pantryPhotoRows, pantryImpactPhotoRows, bakeryPhotoRows, availabilityRows, pauseRows, driverRows, exceptionRows, pickupRows, rideRequestRows, routeOfferRows, notificationRows, reportRows, reportMessageRows] = await Promise.all([
    db.select().from(bakeries).orderBy(desc(bakeries.createdAt)),
    db.select().from(pantries).orderBy(desc(pantries.createdAt)),
    db.select().from(rescueRoutes).orderBy(desc(rescueRoutes.createdAt)),
    db.select({
      id: partnerAccounts.id,
      organizationType: partnerAccounts.organizationType,
      organizationId: partnerAccounts.organizationId,
      accountEmail: partnerAccounts.accountEmail,
      administratorName: partnerAccounts.administratorName,
      contactEmail: partnerAccounts.contactEmail,
      contactPhone: partnerAccounts.contactPhone,
      active: partnerAccounts.active,
    }).from(partnerAccounts).orderBy(desc(partnerAccounts.createdAt)),
    db.select({
      id: partnerInvitations.id,
      organizationType: partnerInvitations.organizationType,
      organizationId: partnerInvitations.organizationId,
      accountEmail: partnerInvitations.accountEmail,
      expiresAt: partnerInvitations.expiresAt,
      acceptedAt: partnerInvitations.acceptedAt,
      createdAt: partnerInvitations.createdAt,
    }).from(partnerInvitations).orderBy(desc(partnerInvitations.createdAt)),
    db.select({
      id: adminAccounts.id, email: adminAccounts.email, displayName: adminAccounts.displayName,
      isMaster: adminAccounts.isMaster, active: adminAccounts.active, createdAt: adminAccounts.createdAt,
    }).from(adminAccounts).orderBy(desc(adminAccounts.createdAt)),
    db.select({
      id: adminInvitations.id, email: adminInvitations.email, invitedByAdminId: adminInvitations.invitedByAdminId,
      expiresAt: adminInvitations.expiresAt, acceptedAt: adminInvitations.acceptedAt, createdAt: adminInvitations.createdAt,
    }).from(adminInvitations).orderBy(desc(adminInvitations.createdAt)),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(500),
    db.select().from(organizationContacts).orderBy(desc(organizationContacts.createdAt)),
    db.select().from(pantryAccessPhotos).orderBy(desc(pantryAccessPhotos.createdAt)),
    db.select().from(pantryImpactPhotos).orderBy(desc(pantryImpactPhotos.createdAt)),
    db.select().from(bakeryAccessPhotos).orderBy(desc(bakeryAccessPhotos.createdAt)),
    db.select().from(availabilityWindows).orderBy(desc(availabilityWindows.createdAt)),
    db.select().from(availabilityPauses).orderBy(desc(availabilityPauses.createdAt)),
    db.select({
      id: driverAccounts.id, email: driverAccounts.email, displayName: driverAccounts.displayName,
      phone: driverAccounts.phone, homeAddress: driverAccounts.homeAddress, homeZip: driverAccounts.homeZip,
      dateOfBirth: driverAccounts.dateOfBirth, identityVerificationStatus: driverAccounts.identityVerificationStatus,
      active: driverAccounts.active, createdAt: driverAccounts.createdAt,
    }).from(driverAccounts).orderBy(desc(driverAccounts.createdAt)),
    db.select().from(scheduleExceptions).orderBy(desc(scheduleExceptions.createdAt)),
    db.select().from(bakeryPickupOccurrences).orderBy(desc(bakeryPickupOccurrences.createdAt)),
    db.select().from(driverRideRequests).orderBy(desc(driverRideRequests.createdAt)),
    db.select().from(routeOffers).orderBy(desc(routeOffers.createdAt)),
    db.select().from(inAppNotifications).orderBy(desc(inAppNotifications.createdAt)).limit(500),
    db.select().from(supportReports).orderBy(desc(supportReports.createdAt)).limit(500),
    db.select().from(supportReportMessages).orderBy(supportReportMessages.createdAt),
  ]);

  const namedReportRows = reportRows.map((report) => ({
    ...report,
    reporterName: report.reporterType === "bakery"
      ? bakeryRows.find((bakery) => bakery.id === report.reporterId)?.name ?? report.reporterName
      : report.reporterType === "pantry"
        ? pantryRows.find((pantry) => pantry.id === report.reporterId)?.name ?? report.reporterName
        : report.reporterType === "driver"
          ? driverRows.find((driver) => driver.id === report.reporterId)?.displayName ?? report.reporterName
          : report.reporterName,
  }));

  return Response.json({
    bakeries: bakeryRows, pantries: pantryRows, routes: routeRows,
    partnerAccounts: accountRows, partnerInvitations: invitationRows,
    administrators: administratorRows, adminInvitations: adminInvitationRows, auditLog: auditRows,
    organizationContacts: contactRows,
    pantryAccessPhotos: pantryPhotoRows, pantryImpactPhotos: pantryImpactPhotoRows, bakeryAccessPhotos: bakeryPhotoRows, availabilityWindows: availabilityRows, availabilityPauses: pauseRows,
    drivers: driverRows,
    scheduleExceptions: exceptionRows,
    pickupOccurrences: pickupRows,
    driverRideRequests: rideRequestRows,
    routeOffers: routeOfferRows,
    notifications: notificationRows,
    supportReports: namedReportRows,
    supportReportMessages: reportMessageRows,
  });
}

export async function POST(request: Request) {
  const actor = await getAdministrator();
  if (!actor) return Response.json({ error: "Sign in required" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, string | number | boolean>;
    const kind = String(body.kind ?? "");
    const db = getDb();

    if (kind === "bakery") {
      const schedule = parseBakerySchedule(body);
      const activeDays = Object.keys(schedule);
      const contact = parsePrimaryContact(body);
      const [record] = await db.insert(bakeries).values({
      name: required(body.name, "Bakery name"),
      address: required(body.address, "Address"),
      dropoffInstructions: clean(body.dropoffInstructions),
      latitude: optionalNumber(body.latitude),
      longitude: optionalNumber(body.longitude),
      contactName: contact.name,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      businessPhone: clean(body.businessPhone),
      notificationPhone: clean(body.notificationPhone),
      recurringDays: activeDays.join(", "),
      businessOpenTime: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].businessOpen]))),
      businessCloseTime: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].businessClose]))),
      readyTime: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].readyTime]))),
      arrivalDeadline: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].pickupDeadline]))),
      }).returning();
      await db.insert(organizationContacts).values({ organizationType: "bakery", organizationId: record.id, ...contact, isPrimary: true });
      await writeAudit({ actorType: "admin", actorId: actor.id, actorName: actor.displayName, action: "created bakery profile", entityType: "bakery", entityId: record.id, entityName: record.name });
      return Response.json({ record }, { status: 201 });
    }

    if (kind === "pantry") {
      const schedule = parsePantrySchedule(body);
      const activeDays = [...new Set(schedule.map((window) => window.day))];
      const contact = parsePrimaryContact(body);
      const [record] = await db.insert(pantries).values({
        name: required(body.name, "Pantry name"),
        address: required(body.address, "Address"),
        dropoffInstructions: clean(body.dropoffInstructions),
        latitude: optionalNumber(body.latitude),
        longitude: optionalNumber(body.longitude),
        contactName: contact.name,
        contactEmail: contact.email,
        contactPhone: contact.phone,
        businessPhone: clean(body.businessPhone),
        notificationPhone: clean(body.notificationPhone),
        recurringDays: activeDays.join(", "),
        openTime: JSON.stringify(schedule.map(({ recurrence, day, ordinal, open }) => ({ recurrence, day, ordinal, time: open }))),
        closeTime: JSON.stringify(schedule.map(({ recurrence, day, ordinal, close }) => ({ recurrence, day, ordinal, time: close }))),
        latestArrival: JSON.stringify(schedule.map(({ recurrence, day, ordinal, latestArrival }) => ({ recurrence, day, ordinal, time: latestArrival }))),
        serviceModes: JSON.stringify(schedule.map(({ recurrence, day, ordinal, serviceMode }) => ({ recurrence, day, ordinal, mode: serviceMode }))),
        deliveriesSevenDays: optionalNumber(body.deliveriesSevenDays) ?? 0,
      }).returning();
      await db.insert(organizationContacts).values({ organizationType: "pantry", organizationId: record.id, ...contact, isPrimary: true });
      await writeAudit({ actorType: "admin", actorId: actor.id, actorName: actor.displayName, action: "created pantry profile", entityType: "pantry", entityId: record.id, entityName: record.name });
      return Response.json({ record }, { status: 201 });
    }

    return Response.json({ error: "Unknown record type" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save this record.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const actor = await getAdministrator();
  if (!actor) return Response.json({ error: "Sign in required" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, string | number | boolean>;
    const kind = String(body.kind ?? "");
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) {
      return Response.json({ error: "A valid record id is required." }, { status: 400 });
    }

    const db = getDb();
    if (kind === "bakery") {
      const [existing] = await db.select({ address: bakeries.address }).from(bakeries).where(eq(bakeries.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Bakery not found." }, { status: 404 });
      const contact = parsePrimaryContact(body);
      const schedule = parseBakerySchedule(body);
      const activeDays = Object.keys(schedule);
      const address = required(body.address, "Address");
      const addressChanged = address !== existing.address;
      const [record] = await db.update(bakeries).set({
        name: required(body.name, "Bakery name"),
        address,
        ...(addressChanged ? {
          formattedAddress: "",
          googlePlaceId: "",
          addressValidationStatus: "unvalidated" as const,
          latitude: null,
          longitude: null,
        } : {}),
        dropoffInstructions: clean(body.dropoffInstructions),
        ...(!addressChanged ? {
          latitude: optionalNumber(body.latitude),
          longitude: optionalNumber(body.longitude),
        } : {}),
        contactName: contact.name,
        contactEmail: contact.email,
        contactPhone: contact.phone,
        businessPhone: clean(body.businessPhone),
        notificationPhone: clean(body.notificationPhone),
        recurringDays: activeDays.join(", "),
        businessOpenTime: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].businessOpen]))),
        businessCloseTime: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].businessClose]))),
        readyTime: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].readyTime]))),
        arrivalDeadline: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].pickupDeadline]))),
      }).where(eq(bakeries.id, id)).returning();
      if (!record) return Response.json({ error: "Bakery not found." }, { status: 404 });
      await syncFirstContact(db, "bakery", id, contact);
      await writeAudit({ actorType: "admin", actorId: actor.id, actorName: actor.displayName, action: "updated bakery profile", entityType: "bakery", entityId: record.id, entityName: record.name, details: "Organization details, contact channels, location, or pickup schedule updated" });
      return Response.json({ record });
    }

    if (kind === "pantry") {
      const [existing] = await db.select({ address: pantries.address }).from(pantries).where(eq(pantries.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Pantry not found." }, { status: 404 });
      const contact = parsePrimaryContact(body);
      const schedule = parsePantrySchedule(body);
      const activeDays = [...new Set(schedule.map((window) => window.day))];
      const address = required(body.address, "Address");
      const addressChanged = address !== existing.address;
      const [record] = await db.update(pantries).set({
        name: required(body.name, "Pantry name"),
        address,
        ...(addressChanged ? {
          formattedAddress: "",
          googlePlaceId: "",
          addressValidationStatus: "unvalidated" as const,
          latitude: null,
          longitude: null,
        } : {}),
        dropoffInstructions: clean(body.dropoffInstructions),
        ...(!addressChanged ? {
          latitude: optionalNumber(body.latitude),
          longitude: optionalNumber(body.longitude),
        } : {}),
        contactName: contact.name,
        contactEmail: contact.email,
        contactPhone: contact.phone,
        businessPhone: clean(body.businessPhone),
        notificationPhone: clean(body.notificationPhone),
        recurringDays: activeDays.join(", "),
        openTime: JSON.stringify(schedule.map(({ recurrence, day, ordinal, open }) => ({ recurrence, day, ordinal, time: open }))),
        closeTime: JSON.stringify(schedule.map(({ recurrence, day, ordinal, close }) => ({ recurrence, day, ordinal, time: close }))),
        latestArrival: JSON.stringify(schedule.map(({ recurrence, day, ordinal, latestArrival }) => ({ recurrence, day, ordinal, time: latestArrival }))),
        serviceModes: JSON.stringify(schedule.map(({ recurrence, day, ordinal, serviceMode }) => ({ recurrence, day, ordinal, mode: serviceMode }))),
        deliveriesSevenDays: optionalNumber(body.deliveriesSevenDays) ?? 0,
      }).where(eq(pantries.id, id)).returning();
      if (!record) return Response.json({ error: "Pantry not found." }, { status: 404 });
      await syncFirstContact(db, "pantry", id, contact);
      await writeAudit({ actorType: "admin", actorId: actor.id, actorName: actor.displayName, action: "updated pantry profile", entityType: "pantry", entityId: record.id, entityName: record.name, details: "Organization details, contact channels, location, or receiving schedule updated" });
      return Response.json({ record });
    }

    return Response.json({ error: "Unknown record type" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update this record.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const actor = await getAdministrator();
  if (!actor) return Response.json({ error: "Sign in required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const id = Number(searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "A valid record id is required." }, { status: 400 });
  }

  const db = getDb();
  if (kind === "pantry") {
    const [record] = await db.select({ name: pantries.name }).from(pantries).where(eq(pantries.id, id)).limit(1);
    const accounts = await db.select({ id: partnerAccounts.id, email: partnerAccounts.accountEmail }).from(partnerAccounts).where(and(eq(partnerAccounts.organizationType, "pantry"), eq(partnerAccounts.organizationId, id)));
    const primaryContacts = await db.select({ email: organizationContacts.email }).from(organizationContacts).where(and(eq(organizationContacts.organizationType, "pantry"), eq(organizationContacts.organizationId, id), eq(organizationContacts.isPrimary, true)));
    if (accounts.length) await db.delete(mobileSessions).where(and(eq(mobileSessions.role, "pantry"), inArray(mobileSessions.accountId, accounts.map((account) => account.id))));
    await db.delete(partnerInvitations).where(and(eq(partnerInvitations.organizationType, "pantry"), eq(partnerInvitations.organizationId, id)));
    await db.delete(availabilityWindows).where(and(eq(availabilityWindows.organizationType, "pantry"), eq(availabilityWindows.organizationId, id)));
    await db.delete(availabilityPauses).where(and(eq(availabilityPauses.organizationType, "pantry"), eq(availabilityPauses.organizationId, id)));
    await db.delete(scheduleExceptions).where(and(eq(scheduleExceptions.organizationType, "pantry"), eq(scheduleExceptions.organizationId, id)));
    await db.delete(routeOffers).where(eq(routeOffers.pantryId, id));
    await db.delete(inAppNotifications).where(and(eq(inAppNotifications.recipientType, "pantry"), eq(inAppNotifications.recipientId, id)));
    await db.delete(pushDevices).where(and(eq(pushDevices.recipientType, "pantry"), eq(pushDevices.recipientId, id)));
    await db.delete(supportReports).where(and(eq(supportReports.reporterType, "pantry"), eq(supportReports.reporterId, id)));
    await db.delete(partnerAccounts).where(and(
      eq(partnerAccounts.organizationType, "pantry"),
      eq(partnerAccounts.organizationId, id),
    ));
    await db.delete(organizationContacts).where(and(eq(organizationContacts.organizationType, "pantry"), eq(organizationContacts.organizationId, id)));
    await db.delete(pantryAccessPhotos).where(eq(pantryAccessPhotos.pantryId, id));
    await db.delete(pantries).where(eq(pantries.id, id));
    await sendAccountStatusEmail({ to: [...accounts.map((account) => account.email), ...primaryContacts.map((contact) => contact.email)], recipientName: record?.name ?? "Pantry", accountType: "pantry", action: "deleted" });
    await writeAudit({ actorType: "admin", actorId: actor.id, actorName: actor.displayName, action: "deleted pantry profile", entityType: "pantry", entityId: id, entityName: record?.name ?? "" });
  } else if (kind === "bakery") {
    const [record] = await db.select({ name: bakeries.name }).from(bakeries).where(eq(bakeries.id, id)).limit(1);
    const accounts = await db.select({ id: partnerAccounts.id, email: partnerAccounts.accountEmail }).from(partnerAccounts).where(and(eq(partnerAccounts.organizationType, "bakery"), eq(partnerAccounts.organizationId, id)));
    const primaryContacts = await db.select({ email: organizationContacts.email }).from(organizationContacts).where(and(eq(organizationContacts.organizationType, "bakery"), eq(organizationContacts.organizationId, id), eq(organizationContacts.isPrimary, true)));
    const pickups = await db.select({ id: bakeryPickupOccurrences.id }).from(bakeryPickupOccurrences).where(eq(bakeryPickupOccurrences.bakeryId, id));
    if (accounts.length) await db.delete(mobileSessions).where(and(eq(mobileSessions.role, "bakery"), inArray(mobileSessions.accountId, accounts.map((account) => account.id))));
    if (pickups.length) await db.delete(routeOffers).where(inArray(routeOffers.pickupOccurrenceId, pickups.map((pickup) => pickup.id)));
    await db.delete(partnerInvitations).where(and(eq(partnerInvitations.organizationType, "bakery"), eq(partnerInvitations.organizationId, id)));
    await db.delete(availabilityWindows).where(and(eq(availabilityWindows.organizationType, "bakery"), eq(availabilityWindows.organizationId, id)));
    await db.delete(availabilityPauses).where(and(eq(availabilityPauses.organizationType, "bakery"), eq(availabilityPauses.organizationId, id)));
    await db.delete(scheduleExceptions).where(and(eq(scheduleExceptions.organizationType, "bakery"), eq(scheduleExceptions.organizationId, id)));
    await db.delete(bakeryPickupOccurrences).where(eq(bakeryPickupOccurrences.bakeryId, id));
    await db.delete(inAppNotifications).where(and(eq(inAppNotifications.recipientType, "bakery"), eq(inAppNotifications.recipientId, id)));
    await db.delete(pushDevices).where(and(eq(pushDevices.recipientType, "bakery"), eq(pushDevices.recipientId, id)));
    await db.delete(supportReports).where(and(eq(supportReports.reporterType, "bakery"), eq(supportReports.reporterId, id)));
    await db.delete(partnerAccounts).where(and(
      eq(partnerAccounts.organizationType, "bakery"),
      eq(partnerAccounts.organizationId, id),
    ));
    await db.delete(organizationContacts).where(and(eq(organizationContacts.organizationType, "bakery"), eq(organizationContacts.organizationId, id)));
    await db.delete(bakeryAccessPhotos).where(eq(bakeryAccessPhotos.bakeryId, id));
    await db.delete(bakeries).where(eq(bakeries.id, id));
    await sendAccountStatusEmail({ to: [...accounts.map((account) => account.email), ...primaryContacts.map((contact) => contact.email)], recipientName: record?.name ?? "Bakery", accountType: "bakery", action: "deleted" });
    await writeAudit({ actorType: "admin", actorId: actor.id, actorName: actor.displayName, action: "deleted bakery profile", entityType: "bakery", entityId: id, entityName: record?.name ?? "" });
  } else if (kind === "driver") {
    const [record] = await db.select({ name: driverAccounts.displayName, email: driverAccounts.email }).from(driverAccounts).where(eq(driverAccounts.id, id)).limit(1);
    if (!record) return Response.json({ error: "Driver not found." }, { status: 404 });
    await db.delete(routeOffers).where(eq(routeOffers.driverId, id));
    await db.delete(driverRideRequests).where(eq(driverRideRequests.driverId, id));
    await db.delete(mobileSessions).where(and(eq(mobileSessions.role, "driver"), eq(mobileSessions.accountId, id)));
    await db.delete(inAppNotifications).where(and(eq(inAppNotifications.recipientType, "driver"), eq(inAppNotifications.recipientId, id)));
    await db.delete(pushDevices).where(and(eq(pushDevices.recipientType, "driver"), eq(pushDevices.recipientId, id)));
    await db.delete(supportReports).where(and(eq(supportReports.reporterType, "driver"), eq(supportReports.reporterId, id)));
    await db.delete(driverAccounts).where(eq(driverAccounts.id, id));
    await sendAccountStatusEmail({ to: [record.email], recipientName: record.name || record.email, accountType: "driver", action: "deleted" });
    await writeAudit({ actorType: "admin", actorId: actor.id, actorName: actor.displayName, action: "deleted driver profile and account", entityType: "driver", entityId: id, entityName: record.name, details: record.email });
  } else {
    return Response.json({ error: "Unknown record type" }, { status: 400 });
  }

  return Response.json({ ok: true });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function required(value: unknown, label: string) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function parsePrimaryContact(body: Record<string, string | number | boolean>) {
  const name = required(body.contactName, "Contact name");
  const email = required(body.contactEmail, "Contact email").toLowerCase();
  const phone = required(body.contactPhone, "Contact phone number");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Contact email is invalid.");
  return { name, email, phone };
}

type Database = ReturnType<typeof getDb>;
async function syncFirstContact(db: Database, organizationType: "bakery" | "pantry", organizationId: number, contact: { name: string; email: string; phone: string }) {
  const [existing] = await db.select({ id: organizationContacts.id }).from(organizationContacts).where(and(
    eq(organizationContacts.organizationType, organizationType),
    eq(organizationContacts.organizationId, organizationId),
    eq(organizationContacts.isPrimary, true),
  )).limit(1);
  if (existing) await db.update(organizationContacts).set({ ...contact, updatedAt: new Date() }).where(eq(organizationContacts.id, existing.id));
  else await db.insert(organizationContacts).values({ organizationType, organizationId, ...contact, isPrimary: true });
}

function parseBakerySchedule(body: Record<string, string | number | boolean>) {
  const validDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const activeDays = validDays.filter((day) => body[`bakeryDay_${day}`]);
  if (!activeDays.length) throw new Error("Choose at least one pickup day.");
  const schedule: Record<string, { businessOpen: string; businessClose: string; readyTime: string; pickupDeadline: string }> = {};
  for (const day of activeDays) {
    const businessOpen = normalizeTime(body[`bakeryBusinessOpen_${day}`], `${day} business opening time`);
    const businessClose = normalizeTime(body[`bakeryBusinessClose_${day}`], `${day} business closing time`);
    const readyTime = normalizeTime(body[`bakeryReady_${day}`], `${day} ready time`);
    const pickupDeadline = normalizeTime(body[`bakeryDeadline_${day}`], `${day} pickup deadline`);
    if (businessOpen >= businessClose) throw new Error(`${day}: business closing time must be after opening time.`);
    if (readyTime >= pickupDeadline) throw new Error(`${day}: pickup deadline must be after the ready time.`);
    if (readyTime < businessOpen || pickupDeadline > businessClose) throw new Error(`${day}: the pickup window must fall within business hours.`);
    schedule[day] = { businessOpen, businessClose, readyTime, pickupDeadline };
  }
  return schedule;
}

type ReceivingWindow = {
  recurrence: "weekly" | "monthly";
  day: string;
  ordinal: number | null;
  open: string;
  close: string;
  latestArrival: string;
  serviceMode: "staffed" | "unattended";
};

function parsePantrySchedule(body: Record<string, string | number | boolean>): ReceivingWindow[] {
  const validDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const windowCount = Number(body.windowCount);
  if (Number.isInteger(windowCount) && windowCount > 0) {
    const schedule: ReceivingWindow[] = [];
    for (let index = 0; index < windowCount; index += 1) {
      const recurrence = clean(body[`windowRecurrence_${index}`]);
      const day = clean(body[`windowDay_${index}`]);
      const ordinalValue = Number(body[`windowOrdinal_${index}`]);
      if (recurrence !== "weekly" && recurrence !== "monthly") {
        throw new Error(`Window ${index + 1}: choose weekly or monthly.`);
      }
      if (!validDays.includes(day)) throw new Error(`Window ${index + 1}: choose a weekday.`);
      const ordinal = recurrence === "monthly" ? ordinalValue : null;
      if (recurrence === "monthly" && (!Number.isInteger(ordinalValue) || ordinalValue < 1 || ordinalValue > 5)) {
        throw new Error(`Window ${index + 1}: choose which occurrence of the weekday.`);
      }
      const open = normalizeTime(body[`windowOpen_${index}`], `Window ${index + 1} opening time`);
      const close = normalizeTime(body[`windowClose_${index}`], `Window ${index + 1} closing time`);
      const latestArrival = normalizeTime(body[`windowLatest_${index}`], `Window ${index + 1} latest arrival`);
      const serviceMode = validServiceMode(body[`windowServiceMode_${index}`], `Window ${index + 1}`);
      validateWindow(open, close, latestArrival, `Window ${index + 1}`);
      schedule.push({ recurrence, day, ordinal, open, close, latestArrival, serviceMode });
    }
    return schedule;
  }

  const activeDays = validDays.filter((day) => body[`day_${day}`]);
  if (!activeDays.length) throw new Error("Choose at least one receiving day.");
  return activeDays.map((day) => {
    const open = normalizeTime(body[`openTime_${day}`], `${day} opening time`);
    const close = normalizeTime(body[`closeTime_${day}`], `${day} closing time`);
    const latestArrival = normalizeTime(body[`latestArrival_${day}`], `${day} latest arrival`);
    validateWindow(open, close, latestArrival, day);
    return { recurrence: "weekly" as const, day, ordinal: null, open, close, latestArrival, serviceMode: "staffed" as const };
  });
}

function validateWindow(open: string, close: string, latestArrival: string, label: string) {
  if (open >= close) throw new Error(`${label}: closing time must be after opening time.`);
  if (latestArrival < open || latestArrival > close) {
    throw new Error(`${label}: latest arrival must fall between opening and closing.`);
  }
}
function validServiceMode(value: unknown, label: string) {
  if (value !== "staffed" && value !== "unattended") throw new Error(`${label}: choose staffed or unattended receiving.`);
  return value;
}

function normalizeTime(value: unknown, label: string) {
  const input = required(value, label).toUpperCase().replace(/\s+/g, " ").trim();
  const twelveHour = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  const twentyFourHour = input.match(/^(\d{1,2}):(\d{2})$/);
  let hours: number;
  let minutes: number;

  if (twelveHour) {
    hours = Number(twelveHour[1]);
    minutes = Number(twelveHour[2] ?? "00");
    if (hours < 1 || hours > 12 || minutes > 59) {
      throw new Error(`${label} must look like 9:00 AM.`);
    }
    if (twelveHour[3] === "AM") hours = hours === 12 ? 0 : hours;
    else hours = hours === 12 ? 12 : hours + 12;
  } else if (twentyFourHour) {
    hours = Number(twentyFourHour[1]);
    minutes = Number(twentyFourHour[2]);
    if (hours > 23 || minutes > 59) {
      throw new Error(`${label} must look like 9:00 AM.`);
    }
  } else {
    throw new Error(`${label} must look like 9:00 AM.`);
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
