import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { driverAccounts } from "../../../../db/schema";
import { writeAudit } from "../../../audit";

type StripeIdentitySession = {
  id: string;
  status: string;
  client_reference_id?: string | null;
  metadata?: { driver_id?: string };
  last_error?: { reason?: string } | null;
};

function validStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) ?? "";
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((signature) => {
    const supplied = Buffer.from(signature, "hex");
    const calculated = Buffer.from(expected, "hex");
    return supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
  });
}

export async function POST(request: Request) {
  const secret = (process.env.STRIPE_IDENTITY_WEBHOOK_SECRET ?? "").trim();
  const signature = request.headers.get("stripe-signature") ?? "";
  const payload = await request.text();
  if (!secret || !validStripeSignature(payload, signature, secret)) {
    return Response.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  const event = JSON.parse(payload) as { type?: string; data?: { object?: StripeIdentitySession } };
  const session = event.data?.object;
  if (!session?.id) return Response.json({ received: true });

  const status = event.type === "identity.verification_session.verified"
    ? "verified" as const
    : event.type === "identity.verification_session.requires_input" || event.type === "identity.verification_session.canceled"
      ? "needs_attention" as const
      : event.type === "identity.verification_session.processing"
        ? "pending" as const
        : null;
  if (!status) return Response.json({ received: true });

  const db = getDb();
  const [driver] = await db.update(driverAccounts).set({ identityVerificationStatus: status })
    .where(eq(driverAccounts.identityVerificationReference, session.id)).returning();
  if (driver) {
    await writeAudit({
      actorType: "system",
      actorName: "Stripe Identity",
      action: `driver identity ${status}`,
      entityType: "driver",
      entityId: driver.id,
      entityName: driver.displayName,
      details: session.last_error?.reason ?? session.id,
    });
  }
  return Response.json({ received: true });
}
