import { createHash } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { driverAccounts, mobileSessions } from "../../../../../db/schema";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const bearer = (request: Request) => request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";

async function currentDriver(request: Request) {
  const db = getDb();
  const token = bearer(request);
  const [session] = await db.select().from(mobileSessions).where(and(
    eq(mobileSessions.tokenHash, tokenHash(token)),
    gt(mobileSessions.expiresAt, new Date()),
    eq(mobileSessions.role, "driver"),
  )).limit(1);
  if (!session) return null;
  const [driver] = await db.select().from(driverAccounts).where(eq(driverAccounts.id, session.accountId)).limit(1);
  return driver?.active ? driver : null;
}

function stripeStatus(status: string) {
  if (status === "verified") return "verified" as const;
  if (status === "processing") return "pending" as const;
  if (status === "requires_input") return "needs_attention" as const;
  return "pending" as const;
}

function isUnder18(dateOfBirth: string) {
  const birth = new Date(`${dateOfBirth}T12:00:00Z`);
  const today = new Date();
  const eighteenthBirthday = new Date(Date.UTC(
    birth.getUTCFullYear() + 18,
    birth.getUTCMonth(),
    birth.getUTCDate(),
  ));
  return eighteenthBirthday > today;
}

async function stripeRequest(path: string, init?: RequestInit) {
  const secret = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!secret) throw new Error("Stripe Identity is not configured.");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const stripeError = data.error as { message?: string } | undefined;
    throw new Error(stripeError?.message ?? "Stripe could not start identity verification.");
  }
  return data;
}

export async function GET(request: Request) {
  try {
    const driver = await currentDriver(request);
    if (!driver) return Response.json({ error: "Session expired." }, { status: 401 });
    if (isUnder18(driver.dateOfBirth)) return Response.json({ error: "Drivers must be at least 18 years old." }, { status: 403 });
    if (!driver.identityVerificationReference) {
      const status = driver.identityVerificationStatus === "verified" ? "verified" : "not_started";
      if (status !== driver.identityVerificationStatus) {
        await getDb().update(driverAccounts).set({ identityVerificationStatus: status }).where(eq(driverAccounts.id, driver.id));
      }
      return Response.json({ status, method: "stripe" });
    }
    const session = await stripeRequest(`/identity/verification_sessions/${encodeURIComponent(driver.identityVerificationReference)}`);
    const status = stripeStatus(String(session.status ?? ""));
    await getDb().update(driverAccounts).set({ identityVerificationStatus: status }).where(eq(driverAccounts.id, driver.id));
    return Response.json({ status, method: "stripe" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not check verification." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const driver = await currentDriver(request);
    if (!driver) return Response.json({ error: "Session expired." }, { status: 401 });
    if (isUnder18(driver.dateOfBirth)) return Response.json({ error: "Drivers must be at least 18 years old." }, { status: 403 });
    if (driver.identityVerificationStatus === "verified") {
      return Response.json({ status: "verified", method: "stripe" });
    }

    if (driver.identityVerificationReference) {
      const existing = await stripeRequest(`/identity/verification_sessions/${encodeURIComponent(driver.identityVerificationReference)}`);
      const status = stripeStatus(String(existing.status ?? ""));
      await getDb().update(driverAccounts).set({ identityVerificationStatus: status }).where(eq(driverAccounts.id, driver.id));
      return Response.json({ status, method: "stripe", url: typeof existing.url === "string" ? existing.url : null });
    }

    const origin = (process.env.PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
    const parameters = new URLSearchParams();
    parameters.set("type", "document");
    parameters.set("client_reference_id", String(driver.id));
    parameters.set("provided_details[email]", driver.email);
    parameters.set("metadata[driver_id]", String(driver.id));
    parameters.set("options[document][require_matching_selfie]", "true");
    parameters.set("return_url", `${origin}/identity-verification-complete`);
    const session = await stripeRequest("/identity/verification_sessions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: parameters.toString(),
    });
    const reference = String(session.id ?? "");
    if (!reference) throw new Error("Stripe did not return a verification reference.");
    await getDb().update(driverAccounts).set({
      identityVerificationReference: reference,
      identityVerificationStatus: "pending",
    }).where(eq(driverAccounts.id, driver.id));
    return Response.json({ status: "pending", method: "stripe", url: typeof session.url === "string" ? session.url : null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not start identity verification." }, { status: 400 });
  }
}
