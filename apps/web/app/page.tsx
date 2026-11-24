import Link from "next/link";

export default function LandingPage() {
  return (
    <main>
      <section aria-labelledby="landing-heading">
        <h1 id="landing-heading">Twitter Clone</h1>
        <p>
          Share short posts, follow people, and read a chronological timeline.
        </p>
        <p className="notice">Accounts and posts are public.</p>
        <nav aria-label="Get started" className="actions">
          <Link className="button" href="/register">
            Create account
          </Link>
          <Link href="/login">Log in</Link>
        </nav>
      </section>
    </main>
  );
}
