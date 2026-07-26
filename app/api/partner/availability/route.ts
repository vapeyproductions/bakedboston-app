import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { availabilityWindows, partnerAccounts } from "../../../../db/schema";
import { writeAudit } from "../../../audit";
import { getPartnerAccountId } from "../../../partner-auth";

async function account() {
  const id = await getPartnerAccountId();
  if (!id) return null;
  const [record] = await getDb().select().from(partnerAccounts).where(eq(partnerAccounts.id, id)).limit(1);
  return record ?? null;
}
export async function GET() {
  const current = await account();
  if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
  const rows = await getDb().select().from(availabilityWindows).where(and(
    eq(availabilityWindows.organizationType, current.organizationType),
    eq(availabilityWindows.organizationId, current.organizationId),
    gt(availabilityWindows.endsAt, new Date()),
  ));
  return Response.json({ windows: rows });
}
export async function POST(request: Request) {
  const current = await account();
  if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const endsAt = new Date(String(body.endsAt ?? ""));
  const startsAt = new Date();
  if (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) return Response.json({ error: "Choose an end time later than now." }, { status: 400 });
  if (endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60 * 1000) return Response.json({ error: "Temporary availability must end within 24 hours." }, { status: 400 });
  const [record] = await getDb().insert(availabilityWindows).values({ organizationType: current.organizationType, organizationId: current.organizationId, startsAt, endsAt }).returning();
  await writeAudit({ actorType: "partner", actorId: current.id, actorName: current.accountEmail, action: "opened temporary availability window", entityType: current.organizationType, entityId: current.organizationId, entityName: current.accountEmail, details: `Available until ${endsAt.toISOString()}` });
  return Response.json({ record }, { status: 201 });
}
