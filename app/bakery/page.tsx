import PartnerWorkspace from "../partner/PartnerWorkspace";
import "../partner.css";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { bakeries, partnerAccounts } from "../../db/schema";
import { requirePartnerAccount } from "../partner-auth";

export const dynamic = "force-dynamic";

export default async function BakeryWorkspace() {
  const accountId = await requirePartnerAccount("bakery");
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account || account.organizationType !== "bakery") return null;
  const [organization] = await db.select().from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1);
  if (!organization) return null;
  return <PartnerWorkspace kind="bakery" organization={organization} account={safeAccount(account)} />;
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
