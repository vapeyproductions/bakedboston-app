import { createHash } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "../../../db";
import { bakeries, pantries, partnerInvitations } from "../../../db/schema";
import "../../partner.css";

export const dynamic = "force-dynamic";

export default async function PartnerRegistration({ searchParams }: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const db = getDb();
  const [invitation] = token ? await db.select().from(partnerInvitations).where(and(
    eq(partnerInvitations.tokenHash, tokenHash),
    isNull(partnerInvitations.acceptedAt),
    gt(partnerInvitations.expiresAt, new Date()),
  )).limit(1) : [];

  if (!invitation) return <main className="registrationPage"><section className="expiredInvite">
    <Link className="partnerBrand" href="/"><span>B</span><strong>BakedBoston</strong></Link>
    <p className="portalKicker">INVALID OR EXPIRED INVITATION</p>
    <h1>This link is no longer active.</h1>
    <p>Ask your BakedBoston contact to send a new account invitation.</p>
  </section></main>;

  const table = invitation.organizationType === "bakery" ? bakeries : pantries;
  const [organization] = await db.select({ name: table.name, address: table.address }).from(table)
    .where(eq(table.id, invitation.organizationId)).limit(1);
  if (!organization) return null;

  return <main className="registrationPage">
    <nav className="partnerNav"><Link className="partnerBrand" href="/"><span>B</span><strong>BakedBoston</strong></Link></nav>
    <section className="registrationLayout">
      <div><p className="portalKicker">ACCOUNT INVITATION</p><h1>Connect to<br /><em>{organization.name}.</em></h1><p>{organization.address}</p></div>
      <form className="partnerLoginCard" action="/api/partner/register" method="post">
        <input type="hidden" name="token" value={token} />
        <small>CONFIRM YOUR ACCOUNT</small><h2>Create your password</h2>
        <div className="registrationEmail"><span>ACCOUNT EMAIL</span><strong>{invitation.accountEmail}</strong></div>
        {error && <div className="loginMessage">The passwords did not match or did not meet the requirements.</div>}
        <label>Password<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
        <label>Confirm password<input name="confirmPassword" type="password" minLength={10} required autoComplete="new-password" /></label>
        <button>Register account <span>→</span></button>
        <p>By registering, you confirm that you are authorized to manage this organization’s BakedBoston profile.</p>
      </form>
    </section>
  </main>;
}
