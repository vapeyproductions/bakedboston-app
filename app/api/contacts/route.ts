import { and, count, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { organizationContacts, partnerAccounts } from "../../../db/schema";
import { getAdministrator } from "../../admin-auth";
import { writeAudit } from "../../audit";
import { getPartnerAccountId } from "../../partner-auth";

export async function POST(request: Request) {
  const access = await resolveAccess();
  if (!access) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const organizationType = access.actorType === "admin" ? validType(body.organizationType) : access.organizationType;
    const organizationId = access.actorType === "admin" ? validId(body.organizationId) : access.organizationId;
    const contact = {
      name: required(body.name, "Contact name"),
      email: validEmail(body.email),
      phone: required(body.phone, "Contact phone number"),
    };
    const [record] = await getDb().insert(organizationContacts).values({
      organizationType, organizationId, ...contact,
    }).returning();
    await writeAudit({
      actorType: access.actorType, actorId: access.actorId, actorName: access.actorName,
      action: "added primary organizational contact", entityType: organizationType,
      entityId: organizationId, entityName: contact.name, details: `${contact.email} · ${contact.phone}`,
    });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not add contact." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const access = await resolveAccess();
  if (!access) return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Valid contact id required." }, { status: 400 });
  const db = getDb();
  const [contact] = await db.select().from(organizationContacts).where(eq(organizationContacts.id, id)).limit(1);
  if (!contact) return Response.json({ error: "Contact not found." }, { status: 404 });
  if (access.actorType === "partner" && (access.organizationType !== contact.organizationType || access.organizationId !== contact.organizationId)) {
    return Response.json({ error: "You cannot change another organization." }, { status: 403 });
  }
  const [{ value }] = await db.select({ value: count() }).from(organizationContacts).where(and(
    eq(organizationContacts.organizationType, contact.organizationType),
    eq(organizationContacts.organizationId, contact.organizationId),
  ));
  if (Number(value) <= 1) return Response.json({ error: "Every organization must retain at least one primary contact." }, { status: 409 });
  await db.delete(organizationContacts).where(eq(organizationContacts.id, id));
  await writeAudit({
    actorType: access.actorType, actorId: access.actorId, actorName: access.actorName,
    action: "deleted primary organizational contact", entityType: contact.organizationType,
    entityId: contact.organizationId, entityName: contact.name, details: contact.email,
  });
  return Response.json({ ok: true });
}

async function resolveAccess() {
  const admin = await getAdministrator();
  if (admin) return { actorType: "admin" as const, actorId: admin.id, actorName: admin.displayName };
  const partnerId = await getPartnerAccountId();
  if (!partnerId) return null;
  const [partner] = await getDb().select().from(partnerAccounts).where(eq(partnerAccounts.id, partnerId)).limit(1);
  if (!partner?.active) return null;
  return {
    actorType: "partner" as const, actorId: partner.id, actorName: partner.administratorName,
    organizationType: partner.organizationType, organizationId: partner.organizationId,
  };
}

function required(value: unknown, label: string) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}
function validEmail(value: unknown) {
  const result = required(value, "Contact email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error("Contact email is invalid.");
  return result;
}
function validType(value: unknown) {
  if (value !== "bakery" && value !== "pantry") throw new Error("Valid organization type required.");
  return value;
}
function validId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error("Valid organization required.");
  return id;
}
