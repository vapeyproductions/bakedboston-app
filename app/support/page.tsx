import Link from "next/link";
import "../legal.css";

export default function SupportPage() {
  return <div className="legalPage"><main>
    <Link className="legalBrand" href="/"><span>B</span>BakedBoston</Link>
    <h1>Support</h1>
    <p>For account questions, technical problems, delivery issues, or privacy requests, email <a href="mailto:help@baked-boston.com">help@baked-boston.com</a>.</p>
    <h2>Help during an active delivery</h2><p>Use <strong>Report Problem</strong> inside the app so the report is connected to your account and delivery. For urgent assistance during an active delivery, call <a href="tel:+16172332956">617-233-2956</a>. If anyone is in immediate danger, call 911.</p>
    <h2>Account deletion</h2><p>Drivers can permanently delete their account from the Profile screen in the BakedBoston app. For partner-account assistance, contact the email address above.</p>
    <p><Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Use</Link></p>
  </main></div>;
}
