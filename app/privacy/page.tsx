import Link from "next/link";
import "../legal.css";

export default function PrivacyPage() {
  return <div className="legalPage"><main>
    <Link className="legalBrand" href="/"><span>B</span>BakedBoston</Link>
    <h1>Privacy Policy</h1><p className="legalUpdated">Effective July 28, 2026</p>
    <p>BakedBoston coordinates volunteer delivery of surplus baked goods from participating bakeries to participating food pantries. This policy explains how we handle information collected through our website, partner portals, administrator portal, and mobile application.</p>
    <h2>Information we collect</h2>
    <ul><li>Account information, including name, email address, telephone number, password credentials, address, ZIP code, and date of birth.</li><li>Organization information, schedules, contacts, delivery instructions, and access photographs supplied by participating bakeries and pantries.</li><li>Location information when a driver grants permission, used to recommend routes and calculate arrival estimates.</li><li>Delivery activity, confirmations, photographs, route history, notifications, support reports, and communications.</li><li>Device information needed to deliver app notifications and maintain secure sessions.</li></ul>
    <h2>How we use information</h2>
    <p>We use this information to create and protect accounts, coordinate pickups and deliveries, recommend feasible routes, communicate delivery status, provide support, investigate reported issues, improve operations, and comply with legal obligations.</p>
    <h2>Sharing and service providers</h2>
    <p>Information is shared only as needed to operate a delivery—for example, relevant names, business contact information, destinations, and access instructions. We also use service providers for hosting, databases, email, notifications, mapping, and application distribution. We do not sell personal information.</p>
    <h2>Retention and deletion</h2>
    <p>We retain information while an account is active and as reasonably necessary for safety, operations, dispute resolution, and legal compliance. Drivers can permanently delete their account from the Profile screen. Other deletion or privacy requests may be sent to <a href="mailto:help@baked-boston.com">help@baked-boston.com</a>.</p>
    <h2>Security and age requirement</h2>
    <p>We use reasonable safeguards, including hashed passwords and protected sessions. No online service can guarantee absolute security. Driver accounts are limited to people age 16 or older.</p>
    <h2>Contact</h2><p>Questions may be sent to <a href="mailto:help@baked-boston.com">help@baked-boston.com</a>.</p>
  </main></div>;
}
