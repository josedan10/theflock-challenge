import Link from "next/link";

import { PageShell } from "../components/page-shell";
import { buttonClass, headingClass } from "../components/styles";

export default function LandingPage() {
  return (
    <PageShell labelledBy="landing-heading">
      <h1 className={headingClass} id="landing-heading">
        Twitter Clone
      </h1>
      <p>
        Share short posts, follow people, and read a chronological timeline.
      </p>
      <p className="text-muted">Accounts and posts are public.</p>
      <nav
        aria-label="Get started"
        className="mt-6 flex flex-wrap items-center gap-4"
      >
        <Link className={buttonClass} href="/register">
          Create account
        </Link>
        <Link href="/login">Log in</Link>
      </nav>
    </PageShell>
  );
}
