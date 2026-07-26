import { createHash } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { bakeries, pantries, partnerAccounts, partnerInvitations } from "../../../../db/schema";
import { createPartnerCookieValue, hashPartnerPassword, partnerCookieName } from "../../../partner-auth";
import { writeAudit } from "../../../audit";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirmPassword") ?? "");
  const failure = new URL(`/register/partner?token=${encodeURIComponent(token)}&error=password`, request.url);
  if (password !== confirmation || password.length < 10) return NextResponse.redirect(failure, 303);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const db = getDb();
  const [invitation] = await db.select().from(partnerInvitations).where(and(
    eq(partnerInvitations.tokenHash, tokenHash),
    isNull(partnerInvitations.acceptedAt),
    gt(partnerInvitations.expiresAt, new Date()),
  )).limit(1);
  if (!invitation) return NextResponse.redirect(new URL("/register/partner?error=expired", request.url), 303);

  const table = invitation.organizationType === "bakery" ? bakeries : pantries;
  const [organization] = await db.select({
    contactName: table.contactName, contactEmail: table.contactEmail, contactPhone: table.contactPhone,
  }).from(table).where(eq(table.id, invitation.organizationId)).limit(1);
  if (!organization) return NextResponse.redirect(new URL("/partners", request.url), 303);

  const [account] = await db.insert(partnerAccounts).values({
    organizationType: invitation.organizationType,
    organizationId: invitation.organizationId,
    accountEmail: invitation.accountEmail,
    passwordHash: hashPartnerPassword(password),
    administratorName: organization.contactName || "Business Administrator",
    contactEmail: organization.contactEmail || invitation.accountEmail,
    contactPhone: organization.contactPhone || "Not provided",
  }).returning({ id: partnerAccounts.id });
  await db.update(partnerInvitations).set({ acceptedAt: new Date() }).where(eq(partnerInvitations.id, invitation.id));
  await writeAudit({
    actorType: "partner", actorId: account.id, actorName: organization.contactName || invitation.accountEmail,
    action: "registered organization account", entityType: invitation.organizationType,
    entityId: invitation.organizationId, entityName: invitation.accountEmail,
    details: `${invitation.organizationType} account invitation accepted`,
  });

  const response = NextResponse.redirect(new URL(`/${invitation.organizationType}`, request.url), 303);
  response.cookies.set(partnerCookieName, createPartnerCookieValue(account.id), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14, path: "/",
  });
  return response;
}
