import PartnerWorkspace from "../partner/PartnerWorkspace";
import "../partner.css";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { organizationContacts, pantries, pantryAccessPhotos, partnerAccounts, rescueRoutes } from "../../db/schema";
import { requirePartnerAccount } from "../partner-auth";

export const dynamic = "force-dynamic";

export default async function PantryWorkspace() {
  const accountId = await requirePartnerAccount("pantry");
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account || account.organizationType !== "pantry") return null;
  const [organization] = await db.select().from(pantries).where(eq(pantries.id, account.organizationId)).limit(1);
  if (!organization) return null;
  const contacts = await db.select().from(organizationContacts).where(eq(organizationContacts.organizationId, organization.id));
  const photos = await db.select().from(pantryAccessPhotos).where(eq(pantryAccessPhotos.pantryId, organization.id));
  const routes = await db.select().from(rescueRoutes).where(eq(rescueRoutes.pantryName, organization.name)).orderBy(desc(rescueRoutes.createdAt));
  return <PartnerWorkspace kind="pantry" organization={organization} account={safeAccount(account)} contacts={contacts.filter((contact) => contact.organizationType === "pantry")} photos={photos} routes={routes} />;
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
