import PartnerWorkspace from "../partner/PartnerWorkspace";
import "../partner.css";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { bakeries, bakeryAccessPhotos, organizationContacts, partnerAccounts } from "../../db/schema";
import { requirePartnerAccount } from "../partner-auth";

export const dynamic = "force-dynamic";

export default async function BakeryWorkspace() {
  const accountId = await requirePartnerAccount("bakery");
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account || account.organizationType !== "bakery") return null;
  const [organization] = await db.select().from(bakeries).where(eq(bakeries.id, account.organizationId)).limit(1);
  if (!organization) return null;
  const contacts = await db.select().from(organizationContacts).where(eq(organizationContacts.organizationId, organization.id));
  const photos = await db.select().from(bakeryAccessPhotos).where(eq(bakeryAccessPhotos.bakeryId, organization.id));
  return <PartnerWorkspace kind="bakery" organization={organization} account={safeAccount(account)} contacts={contacts.filter((contact) => contact.organizationType === "bakery")} photos={photos} />;
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
