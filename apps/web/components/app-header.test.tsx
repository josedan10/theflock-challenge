import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import { AppHeader } from "./app-header";
import {
  fakeApiClient,
  formAlert,
  renderWithSession,
  testSession,
} from "./test-utils";

const pathname = vi.fn(() => "/home");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

const leaveTo = vi.fn();
vi.mock("../lib/navigation", () => ({
  leaveTo: (path: string) => leaveTo(path),
}));

beforeEach(() => {
  pathname.mockReturnValue("/home");
  leaveTo.mockReset();
});

const signedIn = () => fakeApiClient({ me: vi.fn(async () => testSession) });

describe("AppHeader", () => {
  it("offers Home and the member's profile and marks the current page", async () => {
    pathname.mockReturnValue("/u/ada");
    renderWithSession(<AppHeader />, signedIn());

    const profile = await screen.findByRole("link", { name: "Profile" });
    const home = screen.getByRole("link", { name: "Home" });

    expect(home).toHaveAttribute("href", "/home");
    expect(profile).toHaveAttribute("href", "/u/ada");
    expect(profile).toHaveAttribute("aria-current", "page");
    expect(home).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Twitter Clone" })).toHaveAttribute(
      "href",
      "/home",
    );
  });

  it("marks Home as current on /home", async () => {
    renderWithSession(<AppHeader />, signedIn());

    expect(await screen.findByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("US-D01 offers Search and marks it current on /search", async () => {
    pathname.mockReturnValue("/search");
    renderWithSession(<AppHeader />, signedIn());

    const search = await screen.findByRole("link", { name: "Search" });
    expect(search).toHaveAttribute("href", "/search");
    expect(search).toHaveAttribute("aria-current", "page");
  });

  it("offers Log in and Create account to a signed-out visitor", async () => {
    pathname.mockReturnValue("/u/ada");
    renderWithSession(<AppHeader />);

    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/register");
    expect(
      screen.queryByRole("button", { name: "Log out" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Twitter Clone" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("US-A02 AC-A02.3 logs out with the CSRF token, then leaves for the landing page", async () => {
    const apiClient = signedIn();
    renderWithSession(<AppHeader />, apiClient);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Log out" }));

    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith("/"));
    expect(apiClient.logOut).toHaveBeenCalledWith(testSession.csrfToken);
  });

  it("stays put and explains a failed logout", async () => {
    const apiClient = fakeApiClient({
      logOut: vi.fn(async () => {
        throw new ApiError(
          0,
          "NETWORK_ERROR",
          "Can't reach the server. Check your connection and try again.",
        );
      }),
      me: vi.fn(async () => testSession),
    });
    renderWithSession(<AppHeader />, apiClient);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Log out" }));

    await waitFor(() =>
      expect(formAlert()).toHaveTextContent("Can't reach the server"),
    );
    expect(leaveTo).not.toHaveBeenCalled();
  });
});
