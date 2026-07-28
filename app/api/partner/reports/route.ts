import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bakeries, pantries, partnerAccounts, supportReports } from "../../../../db/schema";
import { getPartnerAccountId } from "../../../partner-auth";
import { writeAudit } from "../../../audit";

export async function POST(request: Request) {
  const accountId = await getPartnerAccountId();
  if (!accountId) return Response.json({ error: "Sign in required." }, { status: 401 });
  const [account] = await getDb().select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account?.active) return Response.json({ error: "Account unavailable." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const details = String(body.details ?? "").trim();
  if (!details) return Response.json({ error: "Please describe what happened." }, { status: 400 });
  const urgency = ["routine", "urgent", "safety"].includes(String(body.urgency)) ? String(body.urgency) as "routine" | "urgent" | "safety" : "routine";
  const [organization] = account.organizationType === "bakery"
    ? await getDb().select({ name: bakeries.name }).from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1)
    : await getDb().select({ name: pantries.name }).from(pantries).where(eq(pantries.id, account.organizationId)).limit(1);
  const [report] = await getDb().insert(supportReports).values({
    reporterType: account.organizationType,
    reporterId: account.organizationId,
    reporterName: organization?.name || account.administratorName || account.accountEmail,
    routeOfferId: Number(body.routeOfferId) || null,
    category: String(body.category || "other"),
    urgency,
    details,
  }).returning();
  await writeAudit({ actorType: "partner", actorId: account.id, actorName: account.administratorName || account.accountEmail, action: "submitted support report", entityType: "support_report", entityId: report.id, details: `${report.category} · ${report.urgency}` });
  return Response.json({ report }, { status: 201 });
}
