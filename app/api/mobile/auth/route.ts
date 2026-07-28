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
    let verificationStatus: "not_started" | "pending" | "verified" | "needs_attention" | undefined;
    if (action === "register-driver") {
      if (body.acceptedTerms !== true) throw new Error("You must accept the Terms of Use before creating an account.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
      if (password.length < 10) throw new Error("Create a password with at least 10 characters.");
      const existing = await db.select().from(driverAccounts).where(eq(driverAccounts.email, email)).limit(1);
      if (existing[0]) throw new Error("A driver account already uses this email.");
      const display = String(body.displayName ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const homeAddress = String(body.homeAddress ?? "").trim();
      const homeZip = String(body.homeZip ?? "").trim();
      const dateOfBirth = String(body.dateOfBirth ?? "").trim();
      if (!display || !phone || !homeAddress || !/^\d{5}$/.test(homeZip)) throw new Error("Name, address, phone number, and five-digit ZIP code are required.");
      if (!meetsDriverAgeRequirement(dateOfBirth)) throw new Error("Drivers must enter a valid date of birth and be at least 18 years old.");
      const [driver] = await db.insert(driverAccounts).values({
        email,
        displayName: display,
        phone,
        homeAddress,
        homeZip,
        dateOfBirth,
        passwordHash: hashPartnerPassword(password),
        identityVerificationStatus: "not_started",
      }).returning();
      accountId = driver.id; displayName = driver.displayName;
      verificationStatus = driver.identityVerificationStatus;
    } else if (role === "driver") {
      const [driver] = await db.select().from(driverAccounts).where(eq(driverAccounts.email, email)).limit(1);
      if (!driver || !driver.active || !verifyPartnerPassword(password, driver.passwordHash)) throw new Error("Email or password is incorrect.");
      accountId = driver.id; displayName = driver.displayName;
      verificationStatus = driver.identityVerificationStatus;
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
    return Response.json({ token, session: {
      role,
      accountId,
      displayName,
      email,
      verificationStatus,
    } });
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
    return Response.json({ session: {
      role: session.role,
      accountId: session.accountId,
      displayName: driver.displayName,
      email: driver.email,
      verificationStatus: driver.identityVerificationStatus,
    } });
  }
  const [partner] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, session.accountId)).limit(1);
  if (!partner?.active) return Response.json({ error: "Account unavailable." }, { status: 401 });
  return Response.json({ session: { role: session.role, accountId: session.accountId, displayName: partner.administratorName || partner.accountEmail, email: partner.accountEmail } });
}

function meetsDriverAgeRequirement(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const birth = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== value) return false;
  const today = new Date();
  const threshold = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
  return birth <= threshold;
}

export async function DELETE(request: Request) {
  const token = bearer(request);
  if (token) await getDb().delete(mobileSessions).where(eq(mobileSessions.tokenHash, tokenHash(token)));
  return Response.json({ ok: true });
}
