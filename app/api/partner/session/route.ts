import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { partnerAccounts } from "../../../../db/schema";
import { createPartnerCookieValue, partnerCookieName, verifyPartnerPassword } from "../../../partner-auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (kind !== "bakery" && kind !== "pantry") {
    return NextResponse.redirect(new URL("/partners?error=role", request.url), 303);
  }

  const db = getDb();
  const [account] = await db.select().from(partnerAccounts)
    .where(eq(partnerAccounts.accountEmail, email)).limit(1);
  if (!account || !account.active || account.organizationType !== kind || !verifyPartnerPassword(password, account.passwordHash)) {
    return NextResponse.redirect(new URL(`/partners?kind=${kind}&error=credentials`, request.url), 303);
  }

  const response = NextResponse.redirect(new URL(`/${kind}`, request.url), 303);
  response.cookies.set(partnerCookieName, createPartnerCookieValue(account.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(partnerCookieName, "", { expires: new Date(0), path: "/" });
  return response;
}
