import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PageTransition } from "./page-transition";

const navigation = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

describe("page transition", () => {
  it("remounts the page wrapper when the path changes", () => {
    const { rerender } = render(
      <PageTransition>
        <p>Page</p>
      </PageTransition>,
    );
    const first = screen.getByTestId("page-transition");
    expect(first).toHaveClass("page-enter");

    rerender(
      <PageTransition>
        <p>Page</p>
      </PageTransition>,
    );
    expect(screen.getByTestId("page-transition")).toBe(first);

    navigation.pathname = "/u/ada";
    rerender(
      <PageTransition>
        <p>Page</p>
      </PageTransition>,
    );
    expect(screen.getByTestId("page-transition")).not.toBe(first);
  });
});
