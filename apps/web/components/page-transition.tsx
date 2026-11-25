"use client";

import { usePathname } from "next/navigation";

import type { ReactNode } from "react";

/**
 * Replays the page entrance on every route change. Shared layouts keep their
 * DOM between pages, so the wrapper is keyed by path to remount it; query
 * strings do not count, and cached data lives outside, in the query client.
 * Reduced motion turns the animation off in CSS.
 */
export function PageTransition({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  return (
    <div className="page-enter" data-testid="page-transition" key={pathname}>
      {children}
    </div>
  );
}
