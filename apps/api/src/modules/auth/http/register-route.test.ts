import cookie from "@fastify/cookie";
import {
  authSessionResponseSchema,
  errorResponseSchema,
  type RegisterRequest,
} from "@twitter-clone/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { registerErrorHandling } from "../../../platform/http/errors.js";
import { IdentityConflictError } from "../domain/errors.js";

import { registerRoute } from "./register-route.js";

import type { RegisteredMember } from "../application/register-member.js";

const CREATED_AT = new Date("2026-11-24T12:00:00.000Z");

function registered(input: RegisterRequest): RegisteredMember {
  return {
    credentials: {
      csrfSecretHash: Buffer.alloc(32),
      csrfToken: "c".repeat(43),
      token: "t".repeat(43),
      tokenHash: Buffer.alloc(32),
    },
    session: {
      createdAt: CREATED_AT,
      csrfSecretHash: Buffer.alloc(32),
      expiresAt: new Date(CREATED_AT.getTime() + 3_600_000),
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
      lastSeenAt: CREATED_AT,
      revokedAt: null,
      userId: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
    },
    user: {
      avatarKey: null,
      bio: "",
      createdAt: CREATED_AT,
      displayName: input.displayName ?? input.username,
      email: input.email,
      emailNormalized: input.email.toLowerCase(),
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
      passwordHash: "$argon2id$v=19$secret-hash",
      updatedAt: CREATED_AT,
      username: input.username.toLowerCase(),
    },
  };
}

let app: FastifyInstance;
let calls: RegisterRequest[];

async function buildTestApp(
  behavior: (input: RegisterRequest) => Promise<RegisteredMember> = async (
    input,
  ) => registered(input),
  sessionCookie = { domain: undefined, secure: true, ttlSeconds: 3_600 },
): Promise<FastifyInstance> {
  calls = [];
  app = Fastify({ logger: false });
  registerErrorHandling(app);
  await app.register(cookie);
  await app.register(
    (instance) =>
      registerRoute(instance, {
        registerMember: async (input) => {
          calls.push(input);
          return behavior(input);
        },
        sessionCookie,
      }),
    { prefix: "/v1" },
  );
  await app.ready();
  return app;
}

afterEach(async () => {
  await app.close();
});

const validBody = {
  email: "Ada@Example.com",
  password: "correct horse battery",
  username: "Ada_Lovelace",
};

const register = (payload: unknown) =>
  app.inject({
    method: "POST",
    payload: payload as object,
    url: "/v1/auth/register",
  });

describe("POST /v1/auth/register", () => {
  it("US-A01 AC-A01.1 returns 201 with the session user and CSRF token, never the password", async () => {
    await buildTestApp();

    const response = await register(validBody);

    expect(response.statusCode).toBe(201);
    const body = authSessionResponseSchema.parse(response.json());
    expect(body.user).toMatchObject({
      displayName: "Ada_Lovelace",
      username: "ada_lovelace",
    });
    expect(response.body).not.toContain("correct horse battery");
    expect(response.body).not.toContain("argon2");
    expect(response.body).not.toContain("Ada@Example.com");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("US-A02 AC-A02.1 sets an HTTP-only, SameSite=Lax, Secure session cookie", async () => {
    await buildTestApp(undefined, {
      domain: "example.com",
      secure: true,
      ttlSeconds: 3_600,
    });

    const response = await register(validBody);

    const [sessionCookie] = response.cookies;
    expect(sessionCookie).toMatchObject({
      domain: "example.com",
      httpOnly: true,
      maxAge: 3_600,
      name: "sid",
      path: "/",
      sameSite: "Lax",
      secure: true,
      value: "t".repeat(43),
    });
  });

  it("US-A01 AC-A01.3 rejects invalid fields with 422 and does not call the use case", async () => {
    await buildTestApp();

    const response = await register({
      ...validBody,
      password: "short",
      username: "1x",
    });

    expect(response.statusCode).toBe(422);
    const { error } = errorResponseSchema.parse(response.json());
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(error.fields ?? {}).sort()).toEqual([
      "password",
      "username",
    ]);
    expect(calls).toHaveLength(0);
    expect(response.cookies).toHaveLength(0);
  });

  it("US-A01 AC-A01.3 rejects a non-object body with 422", async () => {
    await buildTestApp();

    const response = await register([]);

    expect(response.statusCode).toBe(422);
    expect(response.json().error.fields).toHaveProperty("body");
  });

  it.each(["email", "username"] as const)(
    "US-A01 AC-A01.2 maps a duplicate %s to 409 with a field-level error",
    async (field) => {
      await buildTestApp(async () => {
        throw new IdentityConflictError(field);
      });

      const response = await register(validBody);

      expect(response.statusCode).toBe(409);
      expect(errorResponseSchema.parse(response.json()).error).toMatchObject({
        code: "CONFLICT",
        fields: { [field]: ["Is already in use."] },
      });
      expect(response.cookies).toHaveLength(0);
    },
  );

  it("returns an opaque 500 when the use case fails unexpectedly", async () => {
    await buildTestApp(async () => {
      throw new Error("db down");
    });

    const response = await register(validBody);

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("db down");
  });
});
