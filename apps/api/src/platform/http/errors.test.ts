import { errorResponseSchema } from "@twitter-clone/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { AppError, registerErrorHandling } from "./errors.js";

let app: FastifyInstance;

async function buildTestApp(): Promise<FastifyInstance> {
  app = Fastify({ logger: false });
  registerErrorHandling(app);
  app.post("/app-error", async () => {
    throw new AppError("CONFLICT", "Some fields are already in use.", {
      username: ["Is already taken."],
    });
  });
  app.get("/crash", async () => {
    throw new Error("connection string postgresql://secret@db leaked");
  });
  app.get("/limited", async () => {
    throw Object.assign(new Error("Rate limit exceeded, retry in 1 minute"), {
      statusCode: 429,
    });
  });
  await app.ready();
  return app;
}

afterEach(async () => {
  await app.close();
});

describe("error envelope", () => {
  it("US-A01 AC-A01.2 renders an AppError with its status, code, and fields", async () => {
    await buildTestApp();

    const response = await app.inject({ method: "POST", url: "/app-error" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: "CONFLICT",
        message: "Some fields are already in use.",
        fields: { username: ["Is already taken."] },
        requestId: expect.any(String),
      },
    });
  });

  it("hides internal error details behind a generic 500", async () => {
    await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/crash" });

    expect(response.statusCode).toBe(500);
    expect(errorResponseSchema.parse(response.json()).error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Something went wrong.",
    });
    expect(response.body).not.toContain("postgresql");
  });

  it("reports malformed JSON as MALFORMED_REQUEST without parser details", async () => {
    await buildTestApp();

    const response = await app.inject({
      headers: { "content-type": "application/json" },
      method: "POST",
      payload: "{not json",
      url: "/app-error",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({
      code: "MALFORMED_REQUEST",
      message: "The request could not be processed.",
    });
  });

  it("US-A01 AC-A01.5 renders rate limiting as RATE_LIMITED", async () => {
    await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/limited" });

    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe("RATE_LIMITED");
  });

  it("renders unknown routes as NOT_FOUND", async () => {
    await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/missing" });

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "NOT_FOUND",
    );
  });
});
