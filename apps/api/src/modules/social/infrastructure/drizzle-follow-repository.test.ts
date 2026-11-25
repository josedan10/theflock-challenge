import { describe, expect, it } from "vitest";

import {
  FollowTargetNotFoundError,
  SelfFollowError,
} from "../domain/errors.js";

import { interpretFollowPersistenceError } from "./drizzle-follow-repository.js";

describe("follow persistence errors", () => {
  it("US-C01 AC-C01.2 maps the self-follow check to a domain error", () => {
    const driver = Object.assign(new Error("check"), { code: "23514" });

    expect(() =>
      interpretFollowPersistenceError(new Error("wrapped", { cause: driver })),
    ).toThrow(SelfFollowError);
  });

  it("maps a disappearing member to an absent target", () => {
    const driver = Object.assign(new Error("fk"), { code: "23503" });

    expect(() => interpretFollowPersistenceError(driver)).toThrow(
      FollowTargetNotFoundError,
    );
  });

  it("leaves unrelated failures untouched", () => {
    const error = new Error("connection reset");

    expect(() => interpretFollowPersistenceError(error)).toThrow(error);
  });
});
