import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { partnerAccounts } from "../../../../db/schema";
import { getAdministrator } from "../../../admin-auth";
import { writeAudit } from "../../../audit";

export async function DELETE(request: Request) {
  const actor = await getAdministrator();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Valid account id required." }, { status: 400 });
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, id)).limit(1);
  await db.delete(partnerAccounts).where(eq(partnerAccounts.id, id));
  if (account) await writeAudit({
    actorType: "admin", actorId: actor.id, actorName: actor.displayName,
    action: "removed partner administrator access", entityType: account.organizationType,
    entityId: account.organizationId, entityName: account.accountEmail,
  });
  return Response.json({ ok: true });
}
