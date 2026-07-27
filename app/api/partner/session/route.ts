import { NextRequest, NextResponse } from "next/server";
import { authenticatePartnerAccount, createPartnerCookieValue, partnerCookieName } from "../../../partner-auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (kind !== "bakery" && kind !== "pantry") {
    return NextResponse.redirect(new URL("/partners?error=role", request.url), 303);
  }

  const result = await authenticatePartnerAccount(email, password, kind);
  if (!result.account) {
    return NextResponse.redirect(new URL(`/partners?kind=${kind}&error=credentials`, request.url), 303);
  }
  const account = result.account;

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
