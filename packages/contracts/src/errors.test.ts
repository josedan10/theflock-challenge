import { describe, expect, it } from "vitest";

import {
  errorCodeSchema,
  errorResponseSchema,
  errorStatusByCode,
} from "./errors.js";

describe("error envelope contract", () => {
  it("US-A01 AC-A01.2 accepts a field-level conflict without exposing internals", () => {
    const body = {
      error: {
        code: "CONFLICT",
        message: "Some fields are already in use.",
        fields: { username: ["Is already taken."] },
        requestId: "req-1",
      },
    };

    expect(errorResponseSchema.parse(body)).toEqual(body);
  });

  it("US-A02 AC-A02.2 accepts a generic error with no field details", () => {
    expect(
      errorResponseSchema.safeParse({
        error: {
          code: "UNAUTHENTICATED",
          message: "Invalid email or password.",
          requestId: "req-2",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects unknown codes, empty field messages, and a missing request ID", () => {
    const base = { code: "CONFLICT", message: "x", requestId: "r" };

    expect(
      errorResponseSchema.safeParse({ error: { ...base, code: "TEAPOT" } })
        .success,
    ).toBe(false);
    expect(
      errorResponseSchema.safeParse({
        error: { ...base, fields: { email: [] } },
      }).success,
    ).toBe(false);
    expect(
      errorResponseSchema.safeParse({
        error: { code: "CONFLICT", message: "x" },
      }).success,
    ).toBe(false);
  });

  it("maps every code to the documented HTTP status", () => {
    expect(errorStatusByCode).toEqual({
      MALFORMED_REQUEST: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      VALIDATION_ERROR: 422,
      RATE_LIMITED: 429,
      INTERNAL_ERROR: 500,
    });
    expect(Object.keys(errorStatusByCode).sort()).toEqual(
      [...errorCodeSchema.options].sort(),
    );
  });
});
