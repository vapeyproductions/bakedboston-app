import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { partnerAccounts } from "../../../../db/schema";
import { writeAudit } from "../../../audit";
import { getPartnerAccountId, hashPartnerPassword } from "../../../partner-auth";

export async function PATCH(request: Request) {
  const accountId = await getPartnerAccountId();
  if (!accountId) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const password = String(body.password ?? "");
  const confirmation = String(body.confirmation ?? "");
  if (password.length < 10) return Response.json({ error: "Password must be at least 10 characters." }, { status: 400 });
  if (password !== confirmation) return Response.json({ error: "New passwords do not match." }, { status: 400 });
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account) return Response.json({ error: "Account not found." }, { status: 404 });
  await db.update(partnerAccounts).set({ passwordHash: hashPartnerPassword(password), updatedAt: new Date() }).where(eq(partnerAccounts.id, accountId));
  await writeAudit({ actorType: "partner", actorId: account.id, actorName: account.accountEmail, action: "changed account password", entityType: account.organizationType, entityId: account.organizationId, entityName: account.accountEmail, details: "Password changed through confirmation flow" });
  return Response.json({ ok: true });
}
