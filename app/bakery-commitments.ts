import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { getDb } from "../db";
import { bakeries, bakeryPickupOccurrences } from "../db/schema";
import { replaceOperationalNotification } from "./operational-notifications";

export function firstCommitmentReminder(bakery: typeof bakeries.$inferSelect, serviceDate: string, pickupStartsAt: Date) {
  try {
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${serviceDate}T12:00:00Z`).getUTCDay()];
    const opens = JSON.parse(bakery.businessOpenTime) as Record<string, string>;
    const ready = JSON.parse(bakery.readyTime) as Record<string, string>;
    const [openHour, openMinute] = opens[day].split(":").map(Number);
    const [readyHour, readyMinute] = ready[day].split(":").map(Number);
    const minutesFromOpeningToPickup = readyHour * 60 + readyMinute - (openHour * 60 + openMinute);
    return new Date(pickupStartsAt.getTime() - minutesFromOpeningToPickup * 60_000 + 60 * 60_000);
  } catch {
    return new Date(pickupStartsAt.getTime() - 4 * 60 * 60_000);
  }
}

export async function processBakeryCommitmentReminders() {
  const db = getDb();
  const now = new Date();
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
    const [advanced] = await db.update(bakeryPickupOccurrences)
      .set({ commitmentReminderDueAt: new Date(now.getTime() + 60 * 60_000), updatedAt: now })
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
      body: "Confirm when you know whether this pickup window will have food available. Choose “Don’t know yet” to be reminded again in one hour.",
    });
  }
}
