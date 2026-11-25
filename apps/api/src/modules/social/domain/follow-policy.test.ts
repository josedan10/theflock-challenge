import { describe, expect, it } from "vitest";

import { decideFollowTarget } from "./follow-policy.js";

describe("follow target policy", () => {
  it("US-C01 AC-C01.1 allows an edge to a different member", () => {
    expect(decideFollowTarget("ada", "grace")).toBe("ok");
  });

  it("US-C01 AC-C01.2 rejects a self edge", () => {
    expect(decideFollowTarget("ada", "ada")).toBe("self");
  });

  it("US-C01 AC-C01.1 treats an absent target as missing", () => {
    expect(decideFollowTarget("ada", null)).toBe("missing");
  });
});
