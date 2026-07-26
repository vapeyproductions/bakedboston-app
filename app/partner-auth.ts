import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "bakedboston-partner";

function secret() {
  return process.env.AUTH_SECRET ?? "";
}

function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function hashPartnerPassword(password: string) {
  if (password.length < 10) throw new Error("Password must be at least 10 characters.");
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPartnerPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createPartnerCookieValue(accountId: number) {
  const value = String(accountId);
  return `${value}.${signature(value)}`;
}

function verifyCookie(value?: string) {
  if (!value || !secret()) return null;
  const [accountId, supplied] = value.split(".");
  const expected = signature(accountId);
  if (!accountId || !supplied || supplied.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  const id = Number(accountId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getPartnerAccountId() {
  const store = await cookies();
  return verifyCookie(store.get(COOKIE_NAME)?.value);
}

export async function requirePartnerAccount(kind: "bakery" | "pantry") {
  const id = await getPartnerAccountId();
  if (!id) redirect(`/partners?kind=${kind}`);
  return id;
}

export const partnerCookieName = COOKIE_NAME;
