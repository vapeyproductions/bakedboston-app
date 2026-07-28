import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, pantries, partnerAccounts } from "../../../../db/schema";
import { writeAudit } from "../../../audit";
import { getPartnerAccountId } from "../../../partner-auth";

export async function GET() {
  const accountId = await getPartnerAccountId();
  if (!accountId) return Response.json({ error: "Sign in required." }, { status: 401 });
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account) return Response.json({ error: "Account not found." }, { status: 404 });
  const [organization] = account.organizationType === "bakery"
    ? await db.select().from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1)
    : await db.select().from(pantries).where(eq(pantries.id, account.organizationId)).limit(1);
  return Response.json({ organization });
}

export async function PATCH(request: Request) {
  const accountId = await getPartnerAccountId();
  if (!accountId) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as { windows?: Array<Record<string, unknown>> };
    const db = getDb();
    const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
    if (!account) return Response.json({ error: "Account not found." }, { status: 404 });
    const windows = body.windows ?? [];
    if (!windows.length) throw new Error("Add at least one schedule window.");

    if (account.organizationType === "bakery") {
      const normalized = windows.map((window) => ({
        day: validDay(window.day),
        businessOpen: validTime(window.businessOpen, "Business opening time"),
        businessClose: validTime(window.businessClose, "Business closing time"),
        readyTime: validTime(window.readyTime, "Food-ready time"),
        pickupDeadline: validTime(window.pickupDeadline, "Pickup deadline"),
      }));
      for (const window of normalized) {
        if (window.businessOpen >= window.businessClose) throw new Error(`${window.day}: business closing time must be later than opening time.`);
        if (window.readyTime >= window.pickupDeadline) throw new Error(`${window.day}: pickup deadline must be later than food-ready time.`);
        if (window.readyTime < window.businessOpen || window.pickupDeadline > window.businessClose) throw new Error(`${window.day}: pickup hours must fall within business hours.`);
      }
      const days = normalized.map((window) => window.day);
      await db.update(bakeries).set({
        recurringDays: days.join(", "),
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
        open: validTime(window.open, "Opening time"),
        close: validTime(window.close, "Closing time"),
        latestArrival: validTime(window.latestArrival, "Latest permitted arrival"),
        serviceMode: validServiceMode(window.serviceMode),
      }));
      for (const window of normalized) {
        if (window.open >= window.close) throw new Error(`${window.day}: closing time must be later than opening time.`);
        if (window.latestArrival < window.open || window.latestArrival > window.close) throw new Error(`${window.day}: latest arrival must fall within the receiving window.`);
      }
      await db.update(pantries).set({
        recurringDays: [...new Set(normalized.map((window) => window.day))].join(", "),
        openTime: JSON.stringify(normalized.map(({ recurrence, day, ordinal, open }) => ({ recurrence, day, ordinal, time: open }))),
        closeTime: JSON.stringify(normalized.map(({ recurrence, day, ordinal, close }) => ({ recurrence, day, ordinal, time: close }))),
        latestArrival: JSON.stringify(normalized.map(({ recurrence, day, ordinal, latestArrival }) => ({ recurrence, day, ordinal, time: latestArrival }))),
        serviceModes: JSON.stringify(normalized.map(({ recurrence, day, ordinal, serviceMode }) => ({ recurrence, day, ordinal, mode: serviceMode }))),
      }).where(eq(pantries.id, account.organizationId));
    }
    await writeAudit({ actorType: "partner", actorId: account.id, actorName: account.accountEmail, action: `updated ${account.organizationType} schedule`, entityType: account.organizationType, entityId: account.organizationId, entityName: account.accountEmail, details: "Recurring availability updated in partner portal" });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save schedule." }, { status: 400 });
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
