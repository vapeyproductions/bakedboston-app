import "../partner.css";
import Link from "next/link";

export default function PartnerPortal() {
  return <main className="portalPage">
    <nav className="partnerNav">
      <Link className="partnerBrand" href="/"><span>B</span><strong>BakedBoston</strong></Link>
      <Link className="quietLink" href="/admin">Administrator</Link>
    </nav>
    <section className="portalHero">
      <p className="portalKicker">PARTNER PORTAL</p>
      <h1>Your place in the<br /><em>rescue network.</em></h1>
      <p>Choose your organization type to preview the workspace your team will use on baked-boston.com.</p>
    </section>
    <section className="portalChoices">
      <Link className="portalChoice bakeryChoice" href="/bakery">
        <span className="choiceIcon">🥖</span>
        <small>BAKERY PARTNERS</small>
        <h2>Share today’s surplus.</h2>
        <p>Manage pickup availability, publish rescues, and follow each handoff.</p>
        <b>Open bakery workspace <span>→</span></b>
      </Link>
      <Link className="portalChoice pantryChoice" href="/pantry">
        <span className="choiceIcon">🥫</span>
        <small>PANTRY PARTNERS</small>
        <h2>Prepare to receive.</h2>
        <p>Manage receiving windows and track incoming and completed deliveries.</p>
        <b>Open pantry workspace <span>→</span></b>
      </Link>
    </section>
    <p className="demoFootnote">Prototype access · Secure organization sign-in will be connected before partner onboarding.</p>
  </main>;
}
