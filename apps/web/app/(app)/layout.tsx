import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { PageTransition } from "@/components/page-transition";

/** Member-facing pages (home, profiles) share the header and one column. */
export default function AppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-6 sm:py-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </>
  );
}
