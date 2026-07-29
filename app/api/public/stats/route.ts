import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { driverAccounts, partnerAccounts, rescueRoutes } from "../../../../db/schema";

export async function GET() {
  const db = getDb();
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const [[bakeries], [pantries], [drivers], [completedThisWeek], [completedTotal]] = await Promise.all([
    db.select({ value: count() }).from(partnerAccounts).where(and(eq(partnerAccounts.organizationType, "bakery"), eq(partnerAccounts.active, true))),
    db.select({ value: count() }).from(partnerAccounts).where(and(eq(partnerAccounts.organizationType, "pantry"), eq(partnerAccounts.active, true))),
    db.select({ value: count() }).from(driverAccounts).where(eq(driverAccounts.active, true)),
    db.select({ value: count() }).from(rescueRoutes).where(and(eq(rescueRoutes.status, "completed"), gte(rescueRoutes.createdAt, weekStart))),
    db.select({ value: count() }).from(rescueRoutes).where(eq(rescueRoutes.status, "completed")),
  ]);
  return Response.json({ bakeries: Number(bakeries.value), pantries: Number(pantries.value), drivers: Number(drivers.value), completedThisWeek: Number(completedThisWeek.value), completedTotal: Number(completedTotal.value) }, { headers: { "Cache-Control": "no-store" } });
}
