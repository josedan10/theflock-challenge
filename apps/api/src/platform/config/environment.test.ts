import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./environment.js";

describe("environment validation", () => {
  it("FND-01 AC-1 applies safe local defaults", () => {
    expect(
      parseEnvironment({ CORS_ORIGIN: "http://localhost:3000" }),
    ).toMatchObject({
      API_HOST: "0.0.0.0",
      API_PORT: 4000,
      NODE_ENV: "development",
    });
  });

  it("FND-01 AC-2 rejects an invalid CORS origin", () => {
    expect(() => parseEnvironment({ CORS_ORIGIN: "*" })).toThrow();
  });
});
