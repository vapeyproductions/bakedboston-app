import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "bakedboston-admin";
const SESSION_VALUE = "administrator";

function signature(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return "";
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createAdminCookieValue() {
  return `${SESSION_VALUE}.${signature(SESSION_VALUE)}`;
}

export function verifyAdminCookieValue(cookieValue?: string) {
  if (!cookieValue) return false;
  const [value, supplied] = cookieValue.split(".");
  const expected = signature(value);
  if (value !== SESSION_VALUE || !supplied || !expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function isAdministrator() {
  const store = await cookies();
  return verifyAdminCookieValue(store.get(COOKIE_NAME)?.value);
}

export async function requireAdministrator() {
  if (!(await isAdministrator())) redirect("/admin/login");
}

export const adminCookieName = COOKIE_NAME;
