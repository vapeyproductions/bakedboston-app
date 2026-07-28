import Link from "next/link";
import "../legal.css";

export default function IdentityVerificationCompletePage() {
  return (
    <main className="legalPage">
      <section className="legalCard">
        <span className="legalEyebrow">BAKEDBOSTON DRIVER</span>
        <h1>Verification submitted</h1>
        <p>Stripe is securely processing your identity verification. Return to BakedBoston and select “Check verification status” to see the latest result.</p>
        <p><a href="bakedboston://identity-verification-complete">Return to the BakedBoston app</a></p>
        <p><Link href="/">Go to baked-boston.com</Link></p>
      </section>
    </main>
  );
}
