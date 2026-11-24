import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";

import { LoginForm } from "./login-form";
import { fakeApiClient, formAlert, renderWithSession } from "./test-utils";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  replace.mockReset();
});

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) {
    await user.type(screen.getByLabelText("Email"), email);
  }
  if (password) {
    await user.type(screen.getByLabelText("Password"), password);
  }
  await user.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginForm", () => {
  it("US-A02 AC-A02.1 logs in and navigates to /home", async () => {
    const { apiClient } = renderWithSession(<LoginForm />);

    await submit("ada@example.com", "correct horse battery");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(apiClient.logIn).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "correct horse battery",
    });
  });

  it("US-A02 AC-A02.2 shows the generic message without blaming a field", async () => {
    const apiClient = fakeApiClient({
      logIn: vi.fn(async () => {
        throw new ApiError(
          401,
          "UNAUTHENTICATED",
          "Invalid email or password.",
        );
      }),
    });
    renderWithSession(<LoginForm />, apiClient);

    await submit("ada@example.com", "wrong password");

    await waitFor(() =>
      expect(formAlert()).toHaveTextContent("Invalid email or password."),
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("asks for missing credentials without calling the API", async () => {
    const { apiClient } = renderWithSession(<LoginForm />);

    await submit("", "");

    expect(formAlert()).toHaveTextContent("Enter your email and password.");
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveFocus());
    expect(apiClient.logIn).not.toHaveBeenCalled();
  });

  it("explains a network failure", async () => {
    const apiClient = fakeApiClient({
      logIn: vi.fn(async () => {
        throw new ApiError(
          0,
          "NETWORK_ERROR",
          "Can't reach the server. Check your connection and try again.",
        );
      }),
    });
    renderWithSession(<LoginForm />, apiClient);

    await submit("ada@example.com", "correct horse battery");

    await waitFor(() =>
      expect(formAlert()).toHaveTextContent("Can't reach the server"),
    );
  });

  it("links to registration", () => {
    renderWithSession(<LoginForm />);

    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/register");
  });

  it("posts natively so credentials never reach the URL before hydration", () => {
    const { container } = renderWithSession(<LoginForm />);

    expect(container.querySelector("form")).toHaveAttribute("method", "post");
  });
});
