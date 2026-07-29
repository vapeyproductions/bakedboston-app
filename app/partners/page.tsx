import "../partner.css";
import Link from "next/link";

export default async function PartnerPortal({ searchParams }: {
  searchParams: Promise<{ kind?: string; error?: string }>;
}) {
  const query = await searchParams;
  const selected = query.kind === "bakery" || query.kind === "pantry" ? query.kind : null;
  if (selected) return <main className="portalPage loginPortal">
    <nav className="partnerNav">
      <Link className="partnerBrand" href="/"><span className="brandMark">B</span><strong className="brandWordmark">BakedBoston</strong></Link>
    </nav>
    <section className="partnerLoginLayout">
      <div className="partnerLoginIntro">
        <span className="choiceIcon">{selected === "bakery" ? "🥖" : "🥫"}</span>
        <p className="portalKicker">{selected.toUpperCase()} PARTNER</p>
        <h1>Welcome<br /><em>back.</em></h1>
        <p>Sign in with the account email assigned to your approved organization.</p>
      </div>
      <form className="partnerLoginCard" action="/api/partner/session" method="post">
        <input type="hidden" name="kind" value={selected} />
        <small>SECURE PARTNER ACCESS</small>
        <h2>Sign in</h2>
        {query.error && <div className="loginMessage">The account email or password was not recognized for this organization type.</div>}
        <label>Account email<input name="email" type="email" required autoComplete="username" placeholder="account@organization.org" /></label>
        <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
        <button>Open {selected} workspace <span>→</span></button>
        <p>Passwords are encrypted and are never visible to BakedBoston administrators.</p>
        <Link href="/partners">← Choose a different organization type</Link>
      </form>
    </section>
  </main>;

  return <main className="portalPage">
    <nav className="partnerNav">
      <Link className="partnerBrand" href="/"><span className="brandMark">B</span><strong className="brandWordmark">BakedBoston</strong></Link>
    </nav>
    <section className="portalHero">
      <p className="portalKicker">PARTNER PORTAL</p>
      <h1>Your place in the<br /><em>BakedBoston network.</em></h1>
      <p>Choose your organization type to log in to your team’s workspace.</p>
    </section>
    <section className="portalChoices">
      <Link className="portalChoice bakeryChoice" href="/partners?kind=bakery">
        <span className="choiceIcon">🥖</span>
        <small>BAKERY PARTNERS</small>
        <h2>Share today’s surplus.</h2>
        <p>Manage pickup availability, publish pickups, and follow each handoff.</p>
        <b>Open bakery workspace <span>→</span></b>
      </Link>
      <Link className="portalChoice pantryChoice" href="/partners?kind=pantry">
        <span className="choiceIcon">🥫</span>
        <small>PANTRY PARTNERS</small>
        <h2>Prepare to receive.</h2>
        <p>Manage receiving windows and track incoming and completed deliveries.</p>
        <b>Open pantry workspace <span>→</span></b>
      </Link>
    </section>
    <p className="demoFootnote">Approved organizations only · Contact BakedBoston to request access.</p>
  </main>;
}
