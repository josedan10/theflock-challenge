import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  FollowListSkeleton,
  HomeSkeleton,
  ProfileSkeleton,
  TimelineSkeleton,
} from "./skeletons";

describe("skeletons", () => {
  it.each([
    ["timeline", <TimelineSkeleton count={2} key="t" label="Loading posts…" />],
    ["home", <HomeSkeleton key="h" label="Loading posts…" />],
    ["profile", <ProfileSkeleton key="p" label="Loading posts…" />],
    ["follow list", <FollowListSkeleton key="f" label="Loading posts…" />],
  ])(
    "AC-B03.5 the %s skeleton is one busy status that announces only its label",
    (_name, ui) => {
      const { container } = render(ui);

      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-busy", "true");
      expect(status).toHaveTextContent(/^Loading posts…$/);
      expect(
        container
          .querySelector('[data-slot="skeleton"]')
          ?.closest('[aria-hidden="true"]'),
      ).not.toBeNull();
    },
  );

  it("renders the requested number of placeholder cards", () => {
    const { container } = render(
      <TimelineSkeleton count={2} label="Loading older posts…" />,
    );

    expect(container.querySelectorAll(".rounded-xl")).toHaveLength(2);
  });
});
