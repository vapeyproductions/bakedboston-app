import { createHash } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "../../../db";
import { adminInvitations } from "../../../db/schema";
import "../../partner.css";

export const dynamic = "force-dynamic";

export default async function AdminRegistration({ searchParams }: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [invitation] = token ? await getDb().select().from(adminInvitations).where(and(
    eq(adminInvitations.tokenHash, tokenHash), isNull(adminInvitations.acceptedAt),
    gt(adminInvitations.expiresAt, new Date()),
  )).limit(1) : [];
  if (!invitation) return <main className="registrationPage"><section className="expiredInvite">
    <Link className="partnerBrand" href="/"><span>B</span><strong>BakedBoston</strong></Link>
    <p className="portalKicker">INVALID OR EXPIRED INVITATION</p><h1>This admin invitation is no longer active.</h1>
  </section></main>;

  return <main className="registrationPage"><nav className="partnerNav"><Link className="partnerBrand" href="/"><span>B</span><strong>BakedBoston</strong></Link></nav>
    <section className="registrationLayout"><div><p className="portalKicker">ADMINISTRATOR INVITATION</p><h1>Help manage<br /><em>BakedBoston.</em></h1><p>Administrator activity is recorded in the private change log.</p></div>
      <form className="partnerLoginCard" action="/api/admin/register" method="post"><input type="hidden" name="token" value={token} />
        <small>CREATE ADMIN ACCOUNT</small><h2>Set up your profile</h2>
        <div className="registrationEmail"><span>LOGIN EMAIL</span><strong>{invitation.email}</strong></div>
        {error && <div className="loginMessage">Check the display name and matching passwords.</div>}
        <label>Display name<input name="displayName" required autoComplete="name" /></label>
        <label>Password<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
        <label>Confirm password<input name="confirmPassword" type="password" minLength={10} required autoComplete="new-password" /></label>
        <button>Create administrator account <span>→</span></button>
      </form>
    </section>
  </main>;
}
