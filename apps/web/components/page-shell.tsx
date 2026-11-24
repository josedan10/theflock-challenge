import type { ReactNode } from "react";

/** Centered, mobile-first single column shared by every page. */
export function PageShell({
  children,
  labelledBy,
}: Readonly<{ children: ReactNode; labelledBy?: string }>) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-6 sm:px-6 sm:py-12">
      <section aria-labelledby={labelledBy} className="w-full max-w-md">
        {children}
      </section>
    </main>
  );
}
