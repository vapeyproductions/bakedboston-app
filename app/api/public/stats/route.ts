import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { driverAccounts, partnerAccounts, rescueRoutes } from "../../../../db/schema";

export async function GET() {
  const db = getDb();
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const [[bakeries], [pantries], [drivers], [completedThisWeek], [completedTotal], completedRoutes] = await Promise.all([
    db.select({ value: count() }).from(partnerAccounts).where(and(eq(partnerAccounts.organizationType, "bakery"), eq(partnerAccounts.active, true))),
    db.select({ value: count() }).from(partnerAccounts).where(and(eq(partnerAccounts.organizationType, "pantry"), eq(partnerAccounts.active, true))),
    db.select({ value: count() }).from(driverAccounts).where(eq(driverAccounts.active, true)),
    db.select({ value: count() }).from(rescueRoutes).where(and(eq(rescueRoutes.status, "completed"), gte(rescueRoutes.createdAt, weekStart))),
    db.select({ value: count() }).from(rescueRoutes).where(eq(rescueRoutes.status, "completed")),
    db.select({ pantryName: rescueRoutes.pantryName, createdAt: rescueRoutes.createdAt }).from(rescueRoutes).where(eq(rescueRoutes.status, "completed")),
  ]);
  const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const bostonDate = (value: Date) => {
    const parts = Object.fromEntries(dateFormatter.formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const helpedByDay = new Map<string, Set<string>>();
  for (const route of completedRoutes) {
    const day = bostonDate(route.createdAt);
    const names = helpedByDay.get(day) ?? new Set<string>();
    names.add(route.pantryName);
    helpedByDay.set(day, names);
  }
  const daysWithNetwork = helpedByDay.size ? Math.floor((Date.parse(`${bostonDate(new Date())}T00:00:00Z`) - Date.parse(`${[...helpedByDay.keys()].sort()[0]}T00:00:00Z`)) / 86_400_000) + 1 : 0;
  const totalPantriesHelped = [...helpedByDay.values()].reduce((sum, names) => sum + names.size, 0);
  const averagePantriesHelpedPerDay = daysWithNetwork ? Number((totalPantriesHelped / daysWithNetwork).toFixed(1)) : 0;
  return Response.json({ bakeries: Number(bakeries.value), pantries: Number(pantries.value), drivers: Number(drivers.value), completedThisWeek: Number(completedThisWeek.value), completedTotal: Number(completedTotal.value), averagePantriesHelpedPerDay }, { headers: { "Cache-Control": "no-store" } });
}
