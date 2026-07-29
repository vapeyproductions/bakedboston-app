import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { getDb } from "../db";
import { bakeries, bakeryPickupOccurrences, scheduleExceptions } from "../db/schema";
import { replaceOperationalNotification } from "./operational-notifications";

export function firstCommitmentReminder(bakery: typeof bakeries.$inferSelect, serviceDate: string, pickupStartsAt: Date) {
  try {
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${serviceDate}T12:00:00Z`).getUTCDay()];
    const opens = JSON.parse(bakery.businessOpenTime) as Record<string, string>;
    const ready = JSON.parse(bakery.readyTime) as Record<string, string>;
    const [openHour, openMinute] = opens[day].split(":").map(Number);
    const [readyHour, readyMinute] = ready[day].split(":").map(Number);
    const minutesFromOpeningToPickup = readyHour * 60 + readyMinute - (openHour * 60 + openMinute);
    return new Date(pickupStartsAt.getTime() - minutesFromOpeningToPickup * 60_000);
  } catch {
    return new Date(pickupStartsAt.getTime() - 4 * 60 * 60_000);
  }
}

export function nextCommitmentReminder(pickupStartsAt: Date, from = new Date()) {
  const minutesUntilPickup = (pickupStartsAt.getTime() - from.getTime()) / 60_000;
  if (minutesUntilPickup <= 15) return new Date(from.getTime() + 5 * 60_000);
  if (minutesUntilPickup <= 60) return new Date(from.getTime() + 10 * 60_000);
  return new Date(Math.min(
    from.getTime() + 60 * 60_000,
    pickupStartsAt.getTime() - 60 * 60_000,
  ));
}

export async function processBakeryCommitmentReminders() {
  const db = getDb();
  const now = new Date();
  await materializeTodayPickupOccurrences(now);
  const occurrences = await db.select().from(bakeryPickupOccurrences).where(and(
    inArray(bakeryPickupOccurrences.status, ["awaiting_confirmation", "decision_deferred"]),
    gt(bakeryPickupOccurrences.pickupDeadline, now),
  ));
  for (const occurrence of occurrences) {
    const [bakery] = await db.select().from(bakeries).where(eq(bakeries.id, occurrence.bakeryId)).limit(1);
    if (!bakery) continue;
    const due = occurrence.commitmentReminderDueAt ?? firstCommitmentReminder(bakery, occurrence.serviceDate, occurrence.pickupWindowStartsAt);
    if (due > now) {
      if (!occurrence.commitmentReminderDueAt) await db.update(bakeryPickupOccurrences)
        .set({ commitmentReminderDueAt: due })
        .where(eq(bakeryPickupOccurrences.id, occurrence.id));
      continue;
    }
    const nextDue = nextCommitmentReminder(occurrence.pickupWindowStartsAt, now);
    const reminderMinutes = Math.max(1, Math.round((nextDue.getTime() - now.getTime()) / 60_000));
    const reminderInterval = reminderMinutes === 60 ? "one hour" : `${reminderMinutes} minutes`;
    const [advanced] = await db.update(bakeryPickupOccurrences)
      .set({ commitmentReminderDueAt: nextDue, updatedAt: now })
      .where(and(
        eq(bakeryPickupOccurrences.id, occurrence.id),
        inArray(bakeryPickupOccurrences.status, ["awaiting_confirmation", "decision_deferred"]),
        lte(bakeryPickupOccurrences.pickupWindowStartsAt, occurrence.pickupDeadline),
      )).returning({ id: bakeryPickupOccurrences.id });
    if (!advanced) continue;
    await replaceOperationalNotification({
      recipientType: "bakery",
      recipientId: bakery.id,
      eventType: "pickup_commitment_reminder",
      threadKey: `pickup:${occurrence.id}`,
      title: "Will food be available for today’s pickup?",
      body: `Confirm when you know whether this pickup window will have food available. Choose “Don’t know yet” to be reminded again in ${reminderInterval}.`,
    });
  }
}

async function materializeTodayPickupOccurrences(now: Date) {
  const db = getDb();
  const serviceDate = easternDate(now);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short",
  }).format(now);
  const [bakeryRows, exceptions] = await Promise.all([
    db.select().from(bakeries).where(eq(bakeries.active, true)),
    db.select().from(scheduleExceptions).where(and(
      eq(scheduleExceptions.organizationType, "bakery"),
      eq(scheduleExceptions.exceptionDate, serviceDate),
    )),
  ]);
  const cancelled = new Set(exceptions.map((exception) => exception.organizationId));
  for (const bakery of bakeryRows) {
    if (cancelled.has(bakery.id)) continue;
    try {
      const ready = JSON.parse(bakery.readyTime) as Record<string, string>;
      const deadlines = JSON.parse(bakery.arrivalDeadline) as Record<string, string>;
      if (!ready[day] || !deadlines[day]) continue;
      const pickupWindowStartsAt = easternDateTime(serviceDate, ready[day]);
      const pickupDeadline = easternDateTime(serviceDate, deadlines[day]);
      if (pickupDeadline <= now) continue;
      await db.insert(bakeryPickupOccurrences).values({
        bakeryId: bakery.id,
        serviceDate,
        pickupWindowStartsAt,
        pickupDeadline,
        commitmentReminderDueAt: firstCommitmentReminder(bakery, serviceDate, pickupWindowStartsAt),
      }).onConflictDoNothing();
    } catch {
      continue;
    }
  }
}

function easternDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function easternDateTime(date: string, time: string) {
  const noon = new Date(`${date}T12:00:00Z`);
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", timeZoneName: "shortOffset",
  }).formatToParts(noon).find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(offsetName);
  const sign = match?.[1] === "+" ? "+" : "-";
  const hour = String(Number(match?.[2] ?? 5)).padStart(2, "0");
  const minute = String(Number(match?.[3] ?? 0)).padStart(2, "0");
  return new Date(`${date}T${time}:00${sign}${hour}:${minute}`);
}
