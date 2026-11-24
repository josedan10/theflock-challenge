import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageSkeleton } from "./page-skeleton";

describe("page skeleton", () => {
  it("FND-03 AC-2 exposes a status region while content loads", () => {
    render(<PageSkeleton label="Loading the page" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(
      within(status).getByText("Loading the page", { selector: "p" }),
    ).toHaveClass("sr-only");
  });
});
