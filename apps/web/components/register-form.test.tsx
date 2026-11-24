import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import { RegisterForm } from "./register-form";
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

async function fillValid() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Username"), "Ada_Lovelace");
  await user.type(screen.getByLabelText("Password"), "correct horse battery");
  return user;
}

describe("RegisterForm", () => {
  it("US-A01 AC-A01.1 registers and navigates to /home", async () => {
    const { apiClient } = renderWithSession(<RegisterForm />);
    const user = await fillValid();

    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(apiClient.register).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "correct horse battery",
      username: "Ada_Lovelace",
    });
  });

  it("US-A01 AC-A01.1 sends the optional display name when given", async () => {
    const { apiClient } = renderWithSession(<RegisterForm />);
    const user = await fillValid();
    await user.type(screen.getByLabelText("Display name"), "Ada");

    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(apiClient.register).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: "Ada" }),
      ),
    );
  });

  it("US-A01 AC-A01.3 validates locally, focuses the first invalid field, and sends nothing", async () => {
    const { apiClient } = renderWithSession(<RegisterForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "short");

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(formAlert()).toHaveTextContent("Fix the highlighted fields.");
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      expect.stringContaining("Must be at least 10 characters."),
    );
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveFocus());
    expect(apiClient.register).not.toHaveBeenCalled();
  });

  it("US-A01 AC-A01.2 shows a duplicate identifier from the API on its field", async () => {
    const apiClient = fakeApiClient({
      register: vi.fn(async () => {
        throw new ApiError(409, "CONFLICT", "Some fields are already in use.", {
          username: ["Is already in use."],
        });
      }),
    });
    renderWithSession(<RegisterForm />, apiClient);
    const user = await fillValid();

    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Username")).toHaveAccessibleDescription(
        expect.stringContaining("Is already in use."),
      ),
    );
    expect(formAlert()).toHaveTextContent("Some fields are already in use.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("prevents a second submit while the request is pending", async () => {
    let resolve: (value: typeof testSession) => void = () => undefined;
    const apiClient = fakeApiClient({
      register: vi.fn(
        () => new Promise<typeof testSession>((done) => (resolve = done)),
      ),
    });
    renderWithSession(<RegisterForm />, apiClient);
    const user = await fillValid();

    await user.click(screen.getByRole("button", { name: "Create account" }));

    const pending = await screen.findByRole("button", {
      name: "Creating account…",
    });
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(apiClient.register).toHaveBeenCalledTimes(1);
    resolve(testSession);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
  });

  it("states that accounts are public and links to login", () => {
    renderWithSession(<RegisterForm />);

    expect(
      screen.getByText("Accounts and posts are public."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("posts natively so credentials never reach the URL before hydration", () => {
    const { container } = renderWithSession(<RegisterForm />);

    expect(container.querySelector("form")).toHaveAttribute("method", "post");
  });
});
