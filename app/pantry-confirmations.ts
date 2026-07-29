import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { availabilityWindows, inAppNotifications, pantries, partnerAccounts } from "../db/schema";
import { pantryWindowAt } from "./pickup-matching";
import { replaceOperationalNotification } from "./operational-notifications";

/** Staffed pantry windows require an explicit opening confirmation. */
export async function processPantryOpeningConfirmations() {
  const db = getDb();
  const now = new Date();
  const [pantryRows, accounts, windows] = await Promise.all([
    db.select().from(pantries).where(eq(pantries.active, true)),
    db.select({ organizationId: partnerAccounts.organizationId }).from(partnerAccounts).where(and(
      eq(partnerAccounts.organizationType, "pantry"),
      eq(partnerAccounts.active, true),
    )),
    db.select().from(availabilityWindows).where(and(
      eq(availabilityWindows.organizationType, "pantry"),
      eq(availabilityWindows.paused, false),
    )),
  ]);
  const registered = new Set(accounts.map((account) => account.organizationId));
  for (const pantry of pantryRows) {
    if (!registered.has(pantry.id)) continue;
    const window = pantryWindowAt(pantry, now, windows);
    if (!window || window.serviceMode !== "staffed") continue;
    const actionKey = `pantry-open:${pantry.id}:${window.key}`;
    const [latest] = await db.select().from(inAppNotifications).where(and(
      eq(inAppNotifications.recipientType, "pantry"),
      eq(inAppNotifications.recipientId, pantry.id),
      eq(inAppNotifications.actionKey, actionKey),
    )).orderBy(desc(inAppNotifications.createdAt)).limit(1);
    if (latest?.acknowledgedAt) continue;
    // The cron runs frequently; the same unconfirmed window is reminded hourly.
    if (latest && now.getTime() - latest.createdAt.getTime() < 60 * 60_000) continue;
    await replaceOperationalNotification({
      recipientType: "pantry",
      recipientId: pantry.id,
      eventType: "pantry_window_confirmation",
      threadKey: actionKey,
      title: "Confirm your pantry is open for deliveries",
      body: "Confirm that your pantry is open and able to receive deliveries. This reminder will repeat every hour until it is confirmed.",
      actionRequired: true,
      actionKey,
    });
  }
}
