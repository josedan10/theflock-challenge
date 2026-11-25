import { describe, expect, it } from "vitest";

import { LikeTargetNotFoundError } from "../domain/errors.js";

import { interpretLikePersistenceError } from "./drizzle-like-repository.js";

describe("like persistence errors", () => {
  it("maps a disappearing member to an absent target", () => {
    const driver = Object.assign(new Error("fk"), { code: "23503" });

    expect(() =>
      interpretLikePersistenceError(new Error("wrapped", { cause: driver })),
    ).toThrow(LikeTargetNotFoundError);
  });

  it("leaves unrelated failures untouched", () => {
    const error = new Error("connection reset");

    expect(() => interpretLikePersistenceError(error)).toThrow(error);
  });
});
