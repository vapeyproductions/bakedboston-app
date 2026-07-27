import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { partnerAccounts, scheduleExceptions } from "../../../../db/schema";
import { writeAudit } from "../../../audit";
import { getPartnerAccountId } from "../../../partner-auth";

async function account() {
  const id = await getPartnerAccountId();
  if (!id) return null;
  return (await getDb().select().from(partnerAccounts).where(eq(partnerAccounts.id, id)).limit(1))[0] ?? null;
}
export async function GET() {
  const current = await account();
  if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
  const exceptions = await getDb().select().from(scheduleExceptions).where(and(eq(scheduleExceptions.organizationType, current.organizationType), eq(scheduleExceptions.organizationId, current.organizationId)));
  return Response.json({ exceptions });
}
export async function POST(request: Request) {
  const current = await account();
  if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
  const exceptionDate = validDate((await request.json() as { exceptionDate?: unknown }).exceptionDate);
  const db = getDb();
  const existing = await db.select().from(scheduleExceptions).where(and(eq(scheduleExceptions.organizationType, current.organizationType), eq(scheduleExceptions.organizationId, current.organizationId), eq(scheduleExceptions.exceptionDate, exceptionDate))).limit(1);
  if (existing[0]) return Response.json({ record: existing[0] });
  const [record] = await db.insert(scheduleExceptions).values({ organizationType: current.organizationType, organizationId: current.organizationId, exceptionDate }).returning();
  await writeAudit({ actorType: "partner", actorId: current.id, actorName: current.accountEmail, action: "cancelled scheduled hours for one date", entityType: current.organizationType, entityId: current.organizationId, entityName: current.accountEmail, details: exceptionDate });
  return Response.json({ record }, { status: 201 });
}
export async function DELETE(request: Request) {
  const current = await account();
  if (!current) return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  const db = getDb();
  const [record] = await db.select().from(scheduleExceptions).where(eq(scheduleExceptions.id, id)).limit(1);
  if (!record || record.organizationType !== current.organizationType || record.organizationId !== current.organizationId) return Response.json({ error: "Cancellation not found." }, { status: 404 });
  await db.delete(scheduleExceptions).where(eq(scheduleExceptions.id, id));
  await writeAudit({ actorType: "partner", actorId: current.id, actorName: current.accountEmail, action: "restored scheduled hours for one date", entityType: current.organizationType, entityId: current.organizationId, entityName: current.accountEmail, details: record.exceptionDate });
  return Response.json({ ok: true });
}
function validDate(value: unknown) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid date.");
  return date;
}
