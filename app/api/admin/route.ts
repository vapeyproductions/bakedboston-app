import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { bakeries, pantries, rescueRoutes } from "../../../db/schema";
import { isAdministrator } from "../../admin-auth";

async function authorized() {
  return isAdministrator();
}

export async function GET() {
  if (!(await authorized())) return Response.json({ error: "Sign in required" }, { status: 401 });

  const db = getDb();
  const [bakeryRows, pantryRows, routeRows] = await Promise.all([
    db.select().from(bakeries).orderBy(desc(bakeries.createdAt)),
    db.select().from(pantries).orderBy(desc(pantries.createdAt)),
    db.select().from(rescueRoutes).orderBy(desc(rescueRoutes.createdAt)),
  ]);

  return Response.json({ bakeries: bakeryRows, pantries: pantryRows, routes: routeRows });
}

export async function POST(request: Request) {
  if (!(await authorized())) return Response.json({ error: "Sign in required" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, string | number | boolean>;
    const kind = String(body.kind ?? "");
    const db = getDb();

    if (kind === "bakery") {
      const [record] = await db.insert(bakeries).values({
      name: required(body.name, "Bakery name"),
      address: required(body.address, "Address"),
      latitude: optionalNumber(body.latitude),
      longitude: optionalNumber(body.longitude),
      contactName: clean(body.contactName),
      contactEmail: clean(body.contactEmail),
      contactPhone: clean(body.contactPhone),
      recurringDays: required(body.recurringDays, "Recurring days"),
      readyTime: required(body.readyTime, "Ready time"),
      arrivalDeadline: required(body.arrivalDeadline, "Arrival deadline"),
      }).returning();
      return Response.json({ record }, { status: 201 });
    }

    if (kind === "pantry") {
      const schedule = parsePantrySchedule(body);
      const activeDays = Object.keys(schedule);
      const [record] = await db.insert(pantries).values({
        name: required(body.name, "Pantry name"),
        address: required(body.address, "Address"),
        latitude: optionalNumber(body.latitude),
        longitude: optionalNumber(body.longitude),
        contactName: clean(body.contactName),
        contactEmail: clean(body.contactEmail),
        contactPhone: clean(body.contactPhone),
        recurringDays: activeDays.join(", "),
        openTime: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].open]))),
        closeTime: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].close]))),
        latestArrival: JSON.stringify(Object.fromEntries(activeDays.map((day) => [day, schedule[day].latestArrival]))),
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

function parsePantrySchedule(body: Record<string, string | number | boolean>) {
  const validDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const activeDays = validDays.filter((day) => body[`day_${day}`]);
  if (!activeDays.length) throw new Error("Choose at least one receiving day.");
  const schedule: Record<string, { open: string; close: string; latestArrival: string }> = {};
  for (const day of activeDays) {
    const open = required(body[`openTime_${day}`], `${day} opening time`);
    const close = required(body[`closeTime_${day}`], `${day} closing time`);
    const latestArrival = required(body[`latestArrival_${day}`], `${day} latest arrival`);
    if (open >= close) throw new Error(`${day}: closing time must be after opening time.`);
    if (latestArrival < open || latestArrival > close) {
      throw new Error(`${day}: latest arrival must fall between opening and closing.`);
    }
    schedule[day] = { open, close, latestArrival };
  }
  return schedule;
}
