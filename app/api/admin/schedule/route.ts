import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, pantries } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { writeAudit } from "../../../audit";

export async function PATCH(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as { organizationType?: unknown; organizationId?: unknown; windows?: Array<Record<string, unknown>> };
    const organizationType = body.organizationType === "bakery" ? "bakery" : "pantry";
    const organizationId = Number(body.organizationId);
    if (!Number.isInteger(organizationId) || organizationId < 1) throw new Error("Valid organization required.");
    const windows = body.windows ?? [];
    if (!windows.length) throw new Error("An organization must have at least one recurring availability window.");
    const db = getDb();
    if (organizationType === "bakery") {
      const normalized = windows.map((window) => ({ day: validDay(window.day), readyTime: validTime(window.readyTime, "Food-ready time"), pickupDeadline: validTime(window.pickupDeadline, "Pickup deadline") }));
      for (const window of normalized) if (window.readyTime >= window.pickupDeadline) throw new Error(`${window.day}: pickup deadline must be later than food-ready time.`);
      const [bakery] = await db.select({ name: bakeries.name }).from(bakeries).where(eq(bakeries.id, organizationId)).limit(1);
      if (!bakery) return Response.json({ error: "Bakery not found." }, { status: 404 });
      await db.update(bakeries).set({ recurringDays: normalized.map((window) => window.day).join(", "), readyTime: JSON.stringify(Object.fromEntries(normalized.map((window) => [window.day, window.readyTime]))), arrivalDeadline: JSON.stringify(Object.fromEntries(normalized.map((window) => [window.day, window.pickupDeadline]))) }).where(eq(bakeries.id, organizationId));
      await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: "updated bakery recurring schedule", entityType: "bakery", entityId: organizationId, entityName: bakery.name, details: "Recurring pickup availability updated from the admin calendar" });
      return Response.json({ ok: true });
    }
    const normalized = windows.map((window) => ({
      recurrence: window.recurrence === "monthly" ? "monthly" as const : "weekly" as const,
      day: validDay(window.day),
      ordinal: window.recurrence === "monthly" ? validOrdinal(window.ordinal) : null,
      open: validTime(window.open, "Opening time"),
      close: validTime(window.close, "Closing time"),
      latestArrival: validTime(window.latestArrival, "Latest permitted arrival"),
      serviceMode: validServiceMode(window.serviceMode),
    }));
    for (const window of normalized) {
      if (window.open >= window.close) throw new Error(`${window.day}: closing time must be later than opening time.`);
      if (window.latestArrival < window.open || window.latestArrival > window.close) throw new Error(`${window.day}: latest arrival must fall within the receiving window.`);
    }
    const [pantry] = await db.select({ name: pantries.name }).from(pantries).where(eq(pantries.id, organizationId)).limit(1);
    if (!pantry) return Response.json({ error: "Pantry not found." }, { status: 404 });
    await db.update(pantries).set({
      recurringDays: [...new Set(normalized.map((window) => window.day))].join(", "),
      openTime: JSON.stringify(normalized.map(({ recurrence, day, ordinal, open }) => ({ recurrence, day, ordinal, time: open }))),
      closeTime: JSON.stringify(normalized.map(({ recurrence, day, ordinal, close }) => ({ recurrence, day, ordinal, time: close }))),
      latestArrival: JSON.stringify(normalized.map(({ recurrence, day, ordinal, latestArrival }) => ({ recurrence, day, ordinal, time: latestArrival }))),
      serviceModes: JSON.stringify(normalized.map(({ recurrence, day, ordinal, serviceMode }) => ({ recurrence, day, ordinal, mode: serviceMode }))),
    }).where(eq(pantries.id, organizationId));
    await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: "updated pantry recurring schedule", entityType: "pantry", entityId: organizationId, entityName: pantry.name, details: "Recurring availability updated from the admin calendar" });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save recurring schedule." }, { status: 400 });
  }
}

function validDay(value: unknown) {
  const day = String(value ?? "");
  if (!["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(day)) throw new Error("Choose a valid day.");
  return day;
}
function validTime(value: unknown, label: string) {
  const time = String(value ?? "");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`${label} is required.`);
  return time;
}
function validOrdinal(value: unknown) {
  const ordinal = Number(value);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 5) throw new Error("Choose a monthly occurrence.");
  return ordinal;
}
function validServiceMode(value: unknown) {
  if (value !== "staffed" && value !== "unattended") throw new Error("Choose whether the receiving window is staffed or unattended.");
  return value;
}
