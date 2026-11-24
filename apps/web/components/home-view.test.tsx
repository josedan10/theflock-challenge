import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import { HomeView } from "./home-view";
import {
  fakeApiClient,
  formAlert,
  renderWithSession,
  testSession,
} from "./test-utils";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  replace.mockReset();
});

const signedIn = () => fakeApiClient({ me: vi.fn(async () => testSession) });

describe("HomeView", () => {
  it("US-A02 AC-A02.4 shows a loading status until the session resolves", () => {
    renderWithSession(
      <HomeView />,
      fakeApiClient({
        me: vi.fn(
          () => new Promise<typeof testSession | null>(() => undefined),
        ),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your account…",
    );
  });

  it("US-A02 AC-A02.4 shows the member after /me confirms the session", async () => {
    renderWithSession(<HomeView />, signedIn());

    expect(
      await screen.findByRole("heading", { name: "Welcome, Ada" }),
    ).toBeInTheDocument();
    expect(screen.getByText("@ada")).toBeInTheDocument();
  });

  it("US-A02 AC-A02.4 sends a signed-out visitor to /login", async () => {
    renderWithSession(<HomeView />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(
      screen.queryByRole("button", { name: "Log out" }),
    ).not.toBeInTheDocument();
  });

  it("US-A02 AC-A02.3 logs out with the CSRF token and returns to the landing page", async () => {
    const apiClient = signedIn();
    renderWithSession(<HomeView />, apiClient);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Log out" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(apiClient.logOut).toHaveBeenCalledWith(testSession.csrfToken);
    // Logging out must not look like an expired session (flows §2.4).
    expect(replace).not.toHaveBeenCalledWith("/login");
  });

  it("keeps the member signed in and explains a failed logout", async () => {
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
    renderWithSession(<HomeView />, apiClient);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Log out" }));

    await waitFor(() =>
      expect(formAlert()).toHaveTextContent("Can't reach the server"),
    );
    expect(
      screen.getByRole("heading", { name: "Welcome, Ada" }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers a retry when the session cannot be loaded", async () => {
    const me = vi
      .fn<() => Promise<typeof testSession | null>>()
      .mockRejectedValueOnce(
        new ApiError(500, "INTERNAL_ERROR", "Something went wrong."),
      )
      .mockResolvedValueOnce(testSession);
    renderWithSession(<HomeView />, fakeApiClient({ me }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { name: "Welcome, Ada" }),
    ).toBeInTheDocument();
  });
});
