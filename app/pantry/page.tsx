import PartnerWorkspace from "../partner/PartnerWorkspace";
import "../partner.css";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { pantries, partnerAccounts } from "../../db/schema";
import { requirePartnerAccount } from "../partner-auth";

export const dynamic = "force-dynamic";

export default async function PantryWorkspace() {
  const accountId = await requirePartnerAccount("pantry");
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account || account.organizationType !== "pantry") return null;
  const [organization] = await db.select().from(pantries).where(eq(pantries.id, account.organizationId)).limit(1);
  if (!organization) return null;
  return <PartnerWorkspace kind="pantry" organization={organization} account={safeAccount(account)} />;
}

function safeAccount(account: typeof partnerAccounts.$inferSelect) {
  return {
    id: account.id,
    accountEmail: account.accountEmail,
    administratorName: account.administratorName,
    contactEmail: account.contactEmail,
    contactPhone: account.contactPhone,
  };
}
