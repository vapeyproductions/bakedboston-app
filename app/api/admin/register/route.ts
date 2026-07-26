import { createHash } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { adminAccounts, adminInvitations, auditLog } from "../../../../db/schema";
import { adminCookieName, createAdminCookieValue } from "../../../admin-auth";
import { hashPartnerPassword } from "../../../partner-auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const displayName = String(form.get("displayName") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirmPassword") ?? "");
  const failure = new URL(`/register/admin?token=${encodeURIComponent(token)}&error=profile`, request.url);
  if (!displayName || password !== confirmation || password.length < 10) return NextResponse.redirect(failure, 303);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const db = getDb();
  const [invitation] = await db.select().from(adminInvitations).where(and(
    eq(adminInvitations.tokenHash, tokenHash), isNull(adminInvitations.acceptedAt),
    gt(adminInvitations.expiresAt, new Date()),
  )).limit(1);
  if (!invitation) return NextResponse.redirect(new URL("/register/admin?error=expired", request.url), 303);

  const [account] = await db.insert(adminAccounts).values({
    email: invitation.email, passwordHash: hashPartnerPassword(password), displayName,
  }).returning();
  await db.update(adminInvitations).set({ acceptedAt: new Date() }).where(eq(adminInvitations.id, invitation.id));
  await db.insert(auditLog).values({
    actorType: "admin", actorId: account.id, actorName: account.displayName,
    action: "accepted administrator invitation", entityType: "admin_account",
    entityId: account.id, entityName: account.displayName, details: account.email,
  });
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(adminCookieName, createAdminCookieValue(account.id), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12, path: "/",
  });
  return response;
}
