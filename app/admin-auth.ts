import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { adminAccounts, auditLog } from "../db/schema";
import { hashPartnerPassword } from "./partner-auth";

const COOKIE_NAME = "bakedboston-admin";

function signature(value: string) {
  const secret = process.env.AUTH_SECRET ?? "";
  return secret ? createHmac("sha256", secret).update(value).digest("hex") : "";
}

export function createAdminCookieValue(adminId: number) {
  const value = String(adminId);
  return `${value}.${signature(value)}`;
}

function verifyAdminCookieValue(cookieValue?: string) {
  if (!cookieValue) return null;
  const [value, supplied] = cookieValue.split(".");
  const expected = signature(value);
  if (!supplied || !expected || supplied.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getAdministrator() {
  const store = await cookies();
  const cookieValue = store.get(COOKIE_NAME)?.value;
  const legacy = verifyLegacyCookie(cookieValue);
  if (legacy) {
    const db = getDb();
    let [master] = await db.select({
      id: adminAccounts.id, email: adminAccounts.email, displayName: adminAccounts.displayName,
      isMaster: adminAccounts.isMaster, active: adminAccounts.active,
    }).from(adminAccounts).where(eq(adminAccounts.isMaster, true)).limit(1);
    if (!master && process.env.ADMIN_PASSWORD) {
      [master] = await db.insert(adminAccounts).values({
        email: (process.env.MASTER_ADMIN_EMAIL ?? "eva.moughan@gmail.com").toLowerCase(),
        passwordHash: hashPartnerPassword(process.env.ADMIN_PASSWORD),
        displayName: "Eva Moughan",
        isMaster: true,
      }).returning({
        id: adminAccounts.id, email: adminAccounts.email, displayName: adminAccounts.displayName,
        isMaster: adminAccounts.isMaster, active: adminAccounts.active,
      });
      await db.insert(auditLog).values({
        actorType: "system", actorName: "BakedBoston", action: "created master administrator",
        entityType: "admin_account", entityId: master.id, entityName: master.displayName,
        details: master.email,
      });
    }
    return master?.active ? master : null;
  }
  const id = verifyAdminCookieValue(cookieValue);
  if (!id) return null;
  const [account] = await getDb().select({
    id: adminAccounts.id,
    email: adminAccounts.email,
    displayName: adminAccounts.displayName,
    isMaster: adminAccounts.isMaster,
    active: adminAccounts.active,
  }).from(adminAccounts).where(eq(adminAccounts.id, id)).limit(1);
  return account?.active ? account : null;
}

function verifyLegacyCookie(cookieValue?: string) {
  if (!cookieValue) return false;
  const [value, supplied] = cookieValue.split(".");
  const expected = signature(value);
  return value === "administrator" && Boolean(supplied && expected && supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)));
}

export async function isAdministrator() {
  return Boolean(await getAdministrator());
}

export async function requireAdministrator() {
  const account = await getAdministrator();
  if (!account) redirect("/admin/login");
  return account;
}

export const adminCookieName = COOKIE_NAME;
