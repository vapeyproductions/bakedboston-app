import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { availabilityWindows } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { writeAudit } from "../../../audit";

export async function POST(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const organizationType = validType(body.organizationType);
    const organizationId = validId(body.organizationId);
    const startsAt = validDate(body.startsAt, "Opening time");
    const endsAt = validDate(body.endsAt, "Closing time");
    const latestArrival = validDate(body.latestArrival, "Latest permitted arrival");
    validateWindow(startsAt, endsAt, latestArrival);
    const [record] = await getDb().insert(availabilityWindows).values({ organizationType, organizationId, startsAt, endsAt, latestArrival, paused: false }).returning();
    await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: "created one-time availability window", entityType: organizationType, entityId: organizationId, entityName: "", details: `${startsAt.toISOString()}–${endsAt.toISOString()}` });
    return Response.json({ record }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not create window." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = validId(body.id);
    const db = getDb();
    const [existing] = await db.select().from(availabilityWindows).where(eq(availabilityWindows.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Availability window not found." }, { status: 404 });
    const startsAt = validDate(body.startsAt, "Opening time");
    const endsAt = validDate(body.endsAt, "Closing time");
    const latestArrival = validDate(body.latestArrival, "Latest permitted arrival");
    validateWindow(startsAt, endsAt, latestArrival);
    const [record] = await db.update(availabilityWindows).set({ startsAt, endsAt, latestArrival, paused: Boolean(body.paused) }).where(eq(availabilityWindows.id, id)).returning();
    await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: "updated one-time availability window", entityType: existing.organizationType, entityId: existing.organizationId, entityName: "", details: String(id) });
    return Response.json({ record });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not update window." }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  const admin = await getAdministrator();
  if (!admin) return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  const db = getDb();
  const [existing] = await db.select().from(availabilityWindows).where(eq(availabilityWindows.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Availability window not found." }, { status: 404 });
  await db.delete(availabilityWindows).where(eq(availabilityWindows.id, id));
  await writeAudit({ actorType: "admin", actorId: admin.id, actorName: admin.displayName, action: "deleted one-time availability window", entityType: existing.organizationType, entityId: existing.organizationId, entityName: "", details: String(id) });
  return Response.json({ ok: true });
}

function validType(value: unknown) { if (value !== "bakery" && value !== "pantry") throw new Error("Valid organization type required."); return value; }
function validId(value: unknown) { const id = Number(value); if (!Number.isInteger(id) || id < 1) throw new Error("Valid record required."); return id; }
function validDate(value: unknown, label: string) { const date = new Date(String(value ?? "")); if (!Number.isFinite(date.getTime())) throw new Error(`${label} is required.`); return date; }
function validateWindow(start: Date, end: Date, latest: Date) { if (end <= start) throw new Error("Closing time must be later than opening time."); if (latest < start || latest > end) throw new Error("Latest permitted arrival must fall within the window."); }
