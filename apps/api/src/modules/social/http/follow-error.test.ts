import { describe, expect, it } from "vitest";

import {
  FollowTargetNotFoundError,
  SelfFollowError,
} from "../domain/errors.js";

import { mapFollowError } from "./follow-error.js";

describe("follow error mapping", () => {
  it("US-C01 AC-C01.1 maps an absent target to 404", () => {
    expect(() => mapFollowError(new FollowTargetNotFoundError())).toThrow(
      expect.objectContaining({ code: "NOT_FOUND", statusCode: 404 }),
    );
  });

  it("US-C01 AC-C01.2 maps a self-follow to 422", () => {
    expect(() => mapFollowError(new SelfFollowError())).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR", statusCode: 422 }),
    );
  });

  it("rethrows unexpected failures instead of hiding them", () => {
    const error = new Error("connection reset");

    expect(() => mapFollowError(error)).toThrow(error);
  });
});
