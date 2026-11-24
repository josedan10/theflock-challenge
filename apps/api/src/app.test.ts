import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

const openApps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe("platform health", () => {
  it("FND-02 AC-1 returns non-sensitive liveness state", async () => {
    const app = await buildApp({ corsOrigin: "http://localhost:3000" });
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("FND-02 AC-1 reports readiness without exposing internals", async () => {
    const app = await buildApp({ corsOrigin: "http://localhost:3000" });
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
  });

  it("FND-02 AC-1 fails readiness when a dependency is unavailable", async () => {
    const app = await buildApp({
      corsOrigin: "http://localhost:3000",
      readinessCheck: async () => false,
    });
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable" });
  });

  it("FND-02 AC-2 allows only the configured browser origin", async () => {
    const app = await buildApp({ corsOrigin: "http://localhost:3000" });
    openApps.push(app);

    const allowed = await app.inject({
      headers: { origin: "http://localhost:3000" },
      method: "GET",
      url: "/health/live",
    });
    const denied = await app.inject({
      headers: { origin: "https://attacker.example" },
      method: "GET",
      url: "/health/live",
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("US-A01 AC-A01.5 ignores X-Forwarded-For unless a proxy is trusted", async () => {
    const direct = await buildApp({ corsOrigin: "http://localhost:3000" });
    const proxied = await buildApp({
      corsOrigin: "http://localhost:3000",
      trustProxy: ["loopback"],
    });
    openApps.push(direct, proxied);
    for (const app of [direct, proxied]) {
      app.get("/ip", async (request) => ({ ip: request.ip }));
    }
    const request = {
      headers: { "x-forwarded-for": "198.51.100.9" },
      method: "GET" as const,
      remoteAddress: "127.0.0.1",
      url: "/ip",
    };

    expect((await direct.inject(request)).json()).toEqual({ ip: "127.0.0.1" });
    expect((await proxied.inject(request)).json()).toEqual({
      ip: "198.51.100.9",
    });
  });
});
