import { createHash, randomBytes } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { driverAccounts, mobileSessions, partnerAccounts } from "../../../../db/schema";
import { authenticatePartnerAccount, hashPartnerPassword, verifyPartnerPassword } from "../../../partner-auth";

const expiresInMs = 30 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const bearer = (request: Request) => request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "login");
    const role = body.role === "bakery" || body.role === "pantry" ? body.role : "driver";
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const db = getDb();
    let accountId: number;
    let displayName: string;
    if (action === "register-driver") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
      const existing = await db.select().from(driverAccounts).where(eq(driverAccounts.email, email)).limit(1);
      if (existing[0]) throw new Error("A driver account already uses this email.");
      const display = String(body.displayName ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const homeZip = String(body.homeZip ?? "").trim();
      if (!display || !phone || !/^\d{5}$/.test(homeZip)) throw new Error("Name, phone number, and five-digit ZIP code are required.");
      const [driver] = await db.insert(driverAccounts).values({ email, displayName: display, phone, homeZip, passwordHash: hashPartnerPassword(password) }).returning();
      accountId = driver.id; displayName = driver.displayName;
    } else if (role === "driver") {
      const [driver] = await db.select().from(driverAccounts).where(eq(driverAccounts.email, email)).limit(1);
      if (!driver || !driver.active || !verifyPartnerPassword(password, driver.passwordHash)) throw new Error("Email or password is incorrect.");
      accountId = driver.id; displayName = driver.displayName;
    } else {
      const result = await authenticatePartnerAccount(email, password, role);
      if (!result.account) {
        if (result.reason === "role") {
          throw new Error(`This account is registered as a ${result.actualType}. Go back and select that organization type.`);
        }
        throw new Error("Email or password is incorrect.");
      }
      const partner = result.account;
      accountId = partner.id; displayName = partner.administratorName || partner.accountEmail;
    }
    const token = randomBytes(32).toString("base64url");
    await db.insert(mobileSessions).values({ tokenHash: tokenHash(token), role, accountId, expiresAt: new Date(Date.now() + expiresInMs) });
    return Response.json({ token, session: { role, accountId, displayName, email } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not authenticate." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const token = bearer(request);
  const db = getDb();
  const [session] = await db.select().from(mobileSessions).where(and(eq(mobileSessions.tokenHash, tokenHash(token)), gt(mobileSessions.expiresAt, new Date()))).limit(1);
  if (!session) return Response.json({ error: "Session expired." }, { status: 401 });
  if (session.role === "driver") {
    const [driver] = await db.select().from(driverAccounts).where(eq(driverAccounts.id, session.accountId)).limit(1);
    if (!driver?.active) return Response.json({ error: "Account unavailable." }, { status: 401 });
    return Response.json({ session: { role: session.role, accountId: session.accountId, displayName: driver.displayName, email: driver.email } });
  }
  const [partner] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, session.accountId)).limit(1);
  if (!partner?.active) return Response.json({ error: "Account unavailable." }, { status: 401 });
  return Response.json({ session: { role: session.role, accountId: session.accountId, displayName: partner.administratorName || partner.accountEmail, email: partner.accountEmail } });
}

export async function DELETE(request: Request) {
  const token = bearer(request);
  if (token) await getDb().delete(mobileSessions).where(eq(mobileSessions.tokenHash, tokenHash(token)));
  return Response.json({ ok: true });
}
