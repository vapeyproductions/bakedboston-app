import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { scheduleExceptions } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { writeAudit } from "../../../audit";

export async function POST(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const organizationType = body.organizationType === "bakery" ? "bakery" : "pantry";
  const organizationId = Number(body.organizationId);
  const exceptionDate = String(body.exceptionDate ?? "");
  if (!Number.isInteger(organizationId) || organizationId < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(exceptionDate)) return Response.json({ error: "Valid organization and date required." }, { status: 400 });
  const db = getDb();
  const existing = await db.select().from(scheduleExceptions).where(and(eq(scheduleExceptions.organizationType, organizationType), eq(scheduleExceptions.organizationId, organizationId), eq(scheduleExceptions.exceptionDate, exceptionDate))).limit(1);
  if (existing[0]) return Response.json({ record: existing[0] });
  const [record] = await db.insert(scheduleExceptions).values({ organizationType, organizationId, exceptionDate }).returning();
  await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: "cancelled scheduled hours for one date", entityType: organizationType, entityId: organizationId, entityName: "", details: exceptionDate });
  return Response.json({ record }, { status: 201 });
}
export async function DELETE(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  const db = getDb();
  const [record] = await db.select().from(scheduleExceptions).where(eq(scheduleExceptions.id, id)).limit(1);
  if (!record) return Response.json({ error: "Cancellation not found." }, { status: 404 });
  await db.delete(scheduleExceptions).where(eq(scheduleExceptions.id, id));
  await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: "restored scheduled hours for one date", entityType: record.organizationType, entityId: record.organizationId, entityName: "", details: record.exceptionDate });
  return Response.json({ ok: true });
}
