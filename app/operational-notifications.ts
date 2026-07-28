import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { inAppNotifications } from "../db/schema";

type Notification = typeof inAppNotifications.$inferInsert;

export async function replaceOperationalNotification(values: Notification & { threadKey: string }) {
  const db = getDb();
  const [existing] = await db.select({ id: inAppNotifications.id })
    .from(inAppNotifications)
    .where(and(
      eq(inAppNotifications.recipientType, values.recipientType),
      eq(inAppNotifications.recipientId, values.recipientId),
      eq(inAppNotifications.threadKey, values.threadKey),
    ))
    .orderBy(desc(inAppNotifications.createdAt))
    .limit(1);
  if (!existing) return (await db.insert(inAppNotifications).values(values).returning())[0];
  return (await db.update(inAppNotifications).set({
    eventType: values.eventType,
    title: values.title,
    body: values.body,
    actionRequired: values.actionRequired ?? false,
    actionKey: values.actionKey ?? "",
    readAt: null,
    acknowledgedAt: null,
    pushSentAt: null,
    createdAt: new Date(),
  }).where(eq(inAppNotifications.id, existing.id)).returning())[0];
}
