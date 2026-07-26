import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdministrator } from "../../admin-auth";
import "./login.css";

export const dynamic = "force-dynamic";

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdministrator()) redirect("/admin");
  const { error } = await searchParams;

  return <main className="loginPage">
    <section className="loginCard">
      <Link href="/" className="loginBrand"><span>B</span><strong>BakedBoston</strong></Link>
      <p className="loginKicker">ADMINISTRATOR ACCESS</p>
      <h1>Welcome back.</h1>
      <p>Sign in to manage partner organizations and monitor rescue routes.</p>
      {error && <div className="loginError">That password wasn’t recognized.</div>}
      <form action="/api/admin/session" method="post">
        <label>Administrator email<input name="email" type="email" required autoComplete="username" /></label>
        <label>Administrator password<input name="password" type="password" required autoComplete="current-password" /></label>
        <button>Open workspace <span>→</span></button>
      </form>
      <Link href="/" className="backLink">← Return to BakedBoston</Link>
    </section>
    <aside><div><span>PRIVATE WORKSPACE</span><h2>Every rescue begins with a trusted network.</h2><p>Your bakery, pantry, and route records remain protected.</p></div></aside>
  </main>;
}
