import { NextRequest, NextResponse } from "next/server";
import { adminCookieName, createAdminCookieValue } from "../../../admin-auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const supplied = String(form.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected || supplied !== expected) {
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(adminCookieName, createAdminCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName, "", { expires: new Date(0), path: "/" });
  return response;
}
