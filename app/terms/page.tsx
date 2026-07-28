import Link from "next/link";
import "../legal.css";

export default function TermsPage() {
  return <div className="legalPage"><main>
    <Link className="legalBrand" href="/"><span>B</span>BakedBoston</Link>
    <h1>Terms of Use</h1><p className="legalUpdated">Effective July 28, 2026</p>
    <p>By creating an account or using BakedBoston, you agree to use the service responsibly and provide accurate information.</p>
    <h2>Volunteer drivers</h2><p>Drivers must be at least 16 years old, legally permitted and safely able to operate the vehicle they use, follow applicable traffic laws, and accurately confirm delivery activity. Drivers must follow the access, food-handling, and safety instructions shown for each route.</p>
    <h2>Participating organizations</h2><p>Bakeries and pantries are responsible for keeping their schedules, availability, contacts, addresses, and delivery instructions accurate. Participation does not guarantee a pickup or delivery.</p>
    <h2>Safety and acceptable use</h2><p>Do not misuse the service, impersonate another person, provide false confirmations, interfere with deliveries, or use information obtained through BakedBoston for an unrelated purpose. Contact support about a problem and call emergency services when immediate danger exists.</p>
    <h2>Availability</h2><p>Routes, estimates, notifications, and matching recommendations may change because of traffic, partner availability, driver availability, or technical conditions. BakedBoston may suspend or end access when reasonably necessary for safety or program administration.</p>
    <h2>Contact</h2><p>Questions may be sent to <a href="mailto:help@baked-boston.com">help@baked-boston.com</a>.</p>
  </main></div>;
}
