import { createHash } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { driverAccounts, mobileSessions, partnerAccounts, supportReports } from "../../../../db/schema";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const [session] = token ? await getDb().select().from(mobileSessions).where(and(eq(mobileSessions.tokenHash, hash(token)), gt(mobileSessions.expiresAt, new Date()))).limit(1) : [];
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const details = String(body.details ?? "").trim();
  if (!details) return Response.json({ error: "Please describe what happened." }, { status: 400 });
  const urgency = ["routine", "urgent", "safety"].includes(String(body.urgency)) ? String(body.urgency) as "routine" | "urgent" | "safety" : "routine";
  let reporterId = session.accountId;
  let reporterName = "";
  if (session.role === "driver") {
    const [driver] = await getDb().select().from(driverAccounts).where(eq(driverAccounts.id, session.accountId)).limit(1);
    reporterName = driver?.displayName ?? "";
  } else {
    const [partner] = await getDb().select().from(partnerAccounts).where(eq(partnerAccounts.id, session.accountId)).limit(1);
    if (!partner) return Response.json({ error: "Account unavailable." }, { status: 403 });
    reporterId = partner.organizationId;
    reporterName = partner.administratorName || partner.accountEmail;
  }
  const [report] = await getDb().insert(supportReports).values({
    reporterType: session.role,
    reporterId,
    reporterName,
    routeOfferId: Number(body.routeOfferId) || null,
    category: String(body.category || "other"),
    urgency,
    details,
  }).returning();
  return Response.json({ report }, { status: 201 });
}
