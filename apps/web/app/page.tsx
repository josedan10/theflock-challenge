import Link from "next/link";

import { PageShell } from "../components/page-shell";
import { headingClass } from "../components/styles";

import { buttonVariants } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <PageShell labelledBy="landing-heading">
      <h1 className={headingClass} id="landing-heading">
        Twitter Clone
      </h1>
      <p className="mb-2">
        Share short posts, follow people, and read a chronological timeline.
      </p>
      <p className="text-muted-foreground">Accounts and posts are public.</p>
      <nav
        aria-label="Get started"
        className="mt-6 flex flex-wrap items-center gap-4"
      >
        {/* Navigation stays a real link; buttonVariants only borrows the look. */}
        <Link className={buttonVariants({ size: "lg" })} href="/register">
          Create account
        </Link>
        <Link
          className={buttonVariants({ size: "lg", variant: "outline" })}
          href="/login"
        >
          Log in
        </Link>
      </nav>
    </PageShell>
  );
}
