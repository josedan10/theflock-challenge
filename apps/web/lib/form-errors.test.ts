import { registerRequestSchema } from "@twitter-clone/contracts";
import { describe, expect, it } from "vitest";

import { ApiError } from "./api-client";
import { apiFormErrors, zodFieldErrors } from "./form-errors";

describe("form errors", () => {
  it("US-A01 AC-A01.3 groups local validation issues by field", () => {
    const result = registerRequestSchema.safeParse({
      email: "x",
      password: "short",
      username: "1",
    });
    if (result.success) {
      throw new Error("expected invalid input");
    }

    expect(Object.keys(zodFieldErrors(result.error)).sort()).toEqual([
      "email",
      "password",
      "username",
    ]);
  });

  it("US-A01 AC-A01.2 keeps the API's field messages", () => {
    const error = new ApiError(
      409,
      "CONFLICT",
      "Some fields are already in use.",
      {
        email: ["Is already in use."],
      },
    );

    expect(apiFormErrors(error)).toEqual({
      fields: { email: ["Is already in use."] },
      form: "Some fields are already in use.",
    });
  });

  it("US-A01 AC-A01.5 explains rate limiting with retry guidance", () => {
    expect(
      apiFormErrors(new ApiError(429, "RATE_LIMITED", "Too many requests."))
        .form,
    ).toBe("Too many attempts. Wait a minute and try again.");
  });

  it("falls back to a generic message for unexpected errors", () => {
    expect(apiFormErrors(new Error("boom"))).toEqual({
      fields: {},
      form: "Something went wrong. Please try again.",
    });
  });
});
