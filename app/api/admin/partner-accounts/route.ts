import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { partnerAccounts } from "../../../../db/schema";
import { isAdministrator } from "../../../admin-auth";
import { hashPartnerPassword } from "../../../partner-auth";

export async function POST(request: Request) {
  if (!(await isAdministrator())) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const organizationType = String(body.organizationType);
    const organizationId = Number(body.organizationId);
    if ((organizationType !== "bakery" && organizationType !== "pantry") || !Number.isInteger(organizationId)) {
      throw new Error("Choose a valid bakery or pantry.");
    }
    const [record] = await getDb().insert(partnerAccounts).values({
      organizationType,
      organizationId,
      accountEmail: email(body.accountEmail, "Account email"),
      passwordHash: hashPartnerPassword(required(body.password, "Temporary password")),
      administratorName: required(body.administratorName, "Administrator name"),
      contactEmail: email(body.contactEmail, "Contact email"),
      contactPhone: required(body.contactPhone, "Contact phone"),
    }).returning({ id: partnerAccounts.id });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create account.";
    return Response.json({ error: message.includes("partner_accounts_email_unique") ? "That account email is already in use." : message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdministrator())) return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Valid account id required." }, { status: 400 });
  await getDb().delete(partnerAccounts).where(eq(partnerAccounts.id, id));
  return Response.json({ ok: true });
}

function required(value: unknown, label: string) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function email(value: unknown, label: string) {
  const result = required(value, label).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error(`${label} is invalid.`);
  return result;
}
