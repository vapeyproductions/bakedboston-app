import { count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { adminAccounts, auditLog } from "../../../../db/schema";
import { adminCookieName, createAdminCookieValue } from "../../../admin-auth";
import { hashPartnerPassword, verifyPartnerPassword } from "../../../partner-auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const supplied = String(form.get("password") ?? "");
  const db = getDb();
  const [{ value: accountCount }] = await db.select({ value: count() }).from(adminAccounts);

  let account: { id: number; email: string; passwordHash: string; displayName: string; active: boolean } | undefined;
  if (Number(accountCount) === 0) {
    const masterEmail = (process.env.MASTER_ADMIN_EMAIL ?? "eva.moughan@gmail.com").toLowerCase();
    const legacyPassword = process.env.ADMIN_PASSWORD ?? "";
    if (email === masterEmail && legacyPassword && supplied === legacyPassword) {
      [account] = await db.insert(adminAccounts).values({
        email: masterEmail,
        passwordHash: hashPartnerPassword(supplied),
        displayName: "Eva Moughan",
        isMaster: true,
      }).returning();
      await db.insert(auditLog).values({
        actorType: "system", actorName: "BakedBoston", action: "created master administrator",
        entityType: "admin_account", entityId: account.id, entityName: account.displayName,
      });
    }
  } else {
    [account] = await db.select().from(adminAccounts).where(eq(adminAccounts.email, email)).limit(1);
    const masterEmail = (process.env.MASTER_ADMIN_EMAIL ?? "eva.moughan@gmail.com").trim().toLowerCase();
    const recoveryPassword = process.env.ADMIN_PASSWORD ?? "";
    if (
      account?.active &&
      email === masterEmail &&
      recoveryPassword &&
      supplied === recoveryPassword &&
      !verifyPartnerPassword(supplied, account.passwordHash)
    ) {
      const [updated] = await db.update(adminAccounts).set({
        passwordHash: hashPartnerPassword(supplied),
        updatedAt: new Date(),
      }).where(eq(adminAccounts.id, account.id)).returning();
      account = updated;
      await db.insert(auditLog).values({
        actorType: "system", actorName: "BakedBoston",
        action: "recovered master administrator password",
        entityType: "admin_account", entityId: account.id, entityName: account.displayName,
      });
    }
  }

  if (!account || !account.active || !verifyPartnerPassword(supplied, account.passwordHash)) {
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
  }
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(adminCookieName, createAdminCookieValue(account.id), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12, path: "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName, "", { expires: new Date(0), path: "/" });
  return response;
}
