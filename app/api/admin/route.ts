import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { bakeries, pantries, partnerAccounts, partnerInvitations, rescueRoutes } from "../../../db/schema";
import { isAdministrator } from "../../admin-auth";

async function authorized() {
  return isAdministrator();
}

export async function GET() {
  if (!(await authorized())) return Response.json({ error: "Sign in required" }, { status: 401 });

  const db = getDb();
  const [bakeryRows, pantryRows, routeRows, accountRows, invitationRows] = await Promise.all([
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
  ]);

  return Response.json({ bakeries: bakeryRows, pantries: pantryRows, routes: routeRows, partnerAccounts: accountRows, partnerInvitations: invitationRows });
}

export async function POST(request: Request) {
  if (!(await authorized())) return Response.json({ error: "Sign in required" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, string | number | boolean>;
    const kind = String(body.kind ?? "");
    const db = getDb();

    if (kind === "bakery") {
      const schedule = parseBakerySchedule(body);
      const activeDays = Object.keys(schedule);
      const [record] = await db.insert(bakeries).values({
      name: required(body.name, "Bakery name"),
      address: required(body.address, "Address"),
      latitude: optionalNumber(body.latitude),
      longitude: optionalNumber(body.longitude),
      contactName: clean(body.contactName),
      contactEmail: clean(body.contactEmail),
      contactPhone: clean(body.contactPhone),
      businessPhone: clean(body.businessPhone),
      notificationPhone: clean(body.notificationPhone),
      recurringDays: activeDays.join(", "),
      readyTime: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].readyTime]))),
      arrivalDeadline: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].pickupDeadline]))),
      }).returning();
      return Response.json({ record }, { status: 201 });
    }

    if (kind === "pantry") {
      const schedule = parsePantrySchedule(body);
      const activeDays = [...new Set(schedule.map((window) => window.day))];
      const [record] = await db.insert(pantries).values({
        name: required(body.name, "Pantry name"),
        address: required(body.address, "Address"),
        latitude: optionalNumber(body.latitude),
        longitude: optionalNumber(body.longitude),
        contactName: clean(body.contactName),
        contactEmail: clean(body.contactEmail),
        contactPhone: clean(body.contactPhone),
        businessPhone: clean(body.businessPhone),
        notificationPhone: clean(body.notificationPhone),
        recurringDays: activeDays.join(", "),
        openTime: JSON.stringify(schedule.map(({ recurrence, day, ordinal, open }) => ({ recurrence, day, ordinal, time: open }))),
        closeTime: JSON.stringify(schedule.map(({ recurrence, day, ordinal, close }) => ({ recurrence, day, ordinal, time: close }))),
        latestArrival: JSON.stringify(schedule.map(({ recurrence, day, ordinal, latestArrival }) => ({ recurrence, day, ordinal, time: latestArrival }))),
        deliveriesSevenDays: optionalNumber(body.deliveriesSevenDays) ?? 0,
      }).returning();
      return Response.json({ record }, { status: 201 });
    }

    return Response.json({ error: "Unknown record type" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save this record.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!(await authorized())) return Response.json({ error: "Sign in required" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, string | number | boolean>;
    const kind = String(body.kind ?? "");
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) {
      return Response.json({ error: "A valid record id is required." }, { status: 400 });
    }

    const db = getDb();
    if (kind === "bakery") {
      const schedule = parseBakerySchedule(body);
      const activeDays = Object.keys(schedule);
      const [record] = await db.update(bakeries).set({
        name: required(body.name, "Bakery name"),
        address: required(body.address, "Address"),
        latitude: optionalNumber(body.latitude),
        longitude: optionalNumber(body.longitude),
        contactName: clean(body.contactName),
        contactEmail: clean(body.contactEmail),
        contactPhone: clean(body.contactPhone),
        businessPhone: clean(body.businessPhone),
        notificationPhone: clean(body.notificationPhone),
        recurringDays: activeDays.join(", "),
        readyTime: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].readyTime]))),
        arrivalDeadline: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].pickupDeadline]))),
      }).where(eq(bakeries.id, id)).returning();
      if (!record) return Response.json({ error: "Bakery not found." }, { status: 404 });
      return Response.json({ record });
    }

    if (kind === "pantry") {
      const schedule = parsePantrySchedule(body);
      const activeDays = [...new Set(schedule.map((window) => window.day))];
      const [record] = await db.update(pantries).set({
        name: required(body.name, "Pantry name"),
        address: required(body.address, "Address"),
        latitude: optionalNumber(body.latitude),
        longitude: optionalNumber(body.longitude),
        contactName: clean(body.contactName),
        contactEmail: clean(body.contactEmail),
        contactPhone: clean(body.contactPhone),
        businessPhone: clean(body.businessPhone),
        notificationPhone: clean(body.notificationPhone),
        recurringDays: activeDays.join(", "),
        openTime: JSON.stringify(schedule.map(({ recurrence, day, ordinal, open }) => ({ recurrence, day, ordinal, time: open }))),
        closeTime: JSON.stringify(schedule.map(({ recurrence, day, ordinal, close }) => ({ recurrence, day, ordinal, time: close }))),
        latestArrival: JSON.stringify(schedule.map(({ recurrence, day, ordinal, latestArrival }) => ({ recurrence, day, ordinal, time: latestArrival }))),
        deliveriesSevenDays: optionalNumber(body.deliveriesSevenDays) ?? 0,
      }).where(eq(pantries.id, id)).returning();
      if (!record) return Response.json({ error: "Pantry not found." }, { status: 404 });
      return Response.json({ record });
    }

    return Response.json({ error: "Unknown record type" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update this record.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await authorized())) return Response.json({ error: "Sign in required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const id = Number(searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "A valid record id is required." }, { status: 400 });
  }

  const db = getDb();
  if (kind === "pantry") {
    await db.delete(partnerAccounts).where(and(
      eq(partnerAccounts.organizationType, "pantry"),
      eq(partnerAccounts.organizationId, id),
    ));
    await db.delete(pantries).where(eq(pantries.id, id));
  } else if (kind === "bakery") {
    await db.delete(partnerAccounts).where(and(
      eq(partnerAccounts.organizationType, "bakery"),
      eq(partnerAccounts.organizationId, id),
    ));
    await db.delete(bakeries).where(eq(bakeries.id, id));
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

function parseBakerySchedule(body: Record<string, string | number | boolean>) {
  const validDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const activeDays = validDays.filter((day) => body[`bakeryDay_${day}`]);
  if (!activeDays.length) throw new Error("Choose at least one pickup day.");
  const schedule: Record<string, { readyTime: string; pickupDeadline: string }> = {};
  for (const day of activeDays) {
    const readyTime = normalizeTime(body[`bakeryReady_${day}`], `${day} ready time`);
    const pickupDeadline = normalizeTime(body[`bakeryDeadline_${day}`], `${day} pickup deadline`);
    if (readyTime >= pickupDeadline) throw new Error(`${day}: pickup deadline must be after the ready time.`);
    schedule[day] = { readyTime, pickupDeadline };
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
      validateWindow(open, close, latestArrival, `Window ${index + 1}`);
      schedule.push({ recurrence, day, ordinal, open, close, latestArrival });
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
    return { recurrence: "weekly" as const, day, ordinal: null, open, close, latestArrival };
  });
}

function validateWindow(open: string, close: string, latestArrival: string, label: string) {
  if (open >= close) throw new Error(`${label}: closing time must be after opening time.`);
  if (latestArrival < open || latestArrival > close) {
    throw new Error(`${label}: latest arrival must fall between opening and closing.`);
  }
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
