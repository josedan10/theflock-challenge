import Link from "next/link";

import { PageShell } from "../components/page-shell";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageShell labelledBy="missing-heading">
      <p className="mb-4 text-sm font-semibold tracking-widest text-muted-foreground">
        404 · PAGE NOT FOUND
      </p>
      <h1 className="text-3xl leading-tight font-bold" id="missing-heading">
        This link went quiet.
      </h1>
      <p className="mt-3 text-muted-foreground">
        There’s no page at this address. Check the link, or head back to the
        start.
      </p>
      <Link
        className={buttonVariants({ className: "mt-6 min-h-11", size: "lg" })}
        href="/"
      >
        Back to the start
      </Link>
    </PageShell>
  );
}
