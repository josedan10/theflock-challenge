import { describe, expect, it } from "vitest";

import { activityConfig } from "./config.js";

describe("DEV-01 activity simulator settings", () => {
  it("is off unless the flag is exactly true", () => {
    expect(activityConfig({})).toBeNull();
    expect(activityConfig({ ACTIVITY_SIMULATOR: "false" })).toBeNull();
    for (const flag of ["1", "yes", "TRUE", ""]) {
      expect(() => activityConfig({ ACTIVITY_SIMULATOR: flag })).toThrow();
    }
  });

  it("defaults to one action every 30 seconds against the local API", () => {
    expect(activityConfig({ ACTIVITY_SIMULATOR: "true" })).toEqual({
      apiOrigin: "http://localhost:4000",
      intervalMs: 30_000,
    });
  });

  it("bounds the interval", () => {
    const on = { ACTIVITY_SIMULATOR: "true" };
    expect(
      activityConfig({ ...on, ACTIVITY_INTERVAL_SECONDS: "15" })?.intervalMs,
    ).toBe(15_000);
    expect(
      activityConfig({ ...on, ACTIVITY_INTERVAL_SECONDS: "3600" })?.intervalMs,
    ).toBe(3_600_000);
    for (const value of ["14", "0", "3601", "1.5", "-20", "abc", ""]) {
      expect(() =>
        activityConfig({ ...on, ACTIVITY_INTERVAL_SECONDS: value }),
      ).toThrow();
    }
  });

  it("only targets a local API in development", () => {
    const on = { ACTIVITY_SIMULATOR: "true" };
    expect(
      activityConfig({ ...on, ACTIVITY_API_URL: "http://api:4000" })?.apiOrigin,
    ).toBe("http://api:4000");
    for (const url of [
      "https://example.com",
      "http://10.0.0.5:4000",
      "http://localhost:4000/v1",
      "http://localhost:4000?x=1",
      "http://user:pass@localhost:4000",
      "not a url",
    ]) {
      expect(() => activityConfig({ ...on, ACTIVITY_API_URL: url })).toThrow();
    }
    expect(() => activityConfig({ ...on, NODE_ENV: "production" })).toThrow();
  });
});
