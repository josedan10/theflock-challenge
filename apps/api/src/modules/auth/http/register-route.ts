import {
  type AuthSessionResponse,
  registerRequestSchema,
} from "@twitter-clone/contracts";


import { AppError } from "../../../platform/http/errors.js";
import { IdentityConflictError } from "../domain/errors.js";

import {
  SESSION_COOKIE_NAME,
  type SessionCookieSettings,
  sessionCookieOptions,
} from "./session-cookie.js";
import { toSessionUser } from "./session-user.js";

import type { RegisterMember } from "../application/register-member.js";
import type { FastifyInstance } from "fastify";
import type { z } from "zod";

export interface RegisterRouteDependencies {
  registerMember: RegisterMember;
  sessionCookie: SessionCookieSettings;
}

/** Groups Zod issues by top-level field for the contract's `fields` map. */
function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.length === 0 ? "body" : String(issue.path[0]);
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}

/** `POST /auth/register` (US-A01). Mounted under the `/v1` prefix. */
export async function registerRoute(
  app: FastifyInstance,
  dependencies: RegisterRouteDependencies,
): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Some fields are invalid.",
        fieldErrors(parsed.error),
      );
    }

    let registered;
    try {
      registered = await dependencies.registerMember(parsed.data);
    } catch (error: unknown) {
      if (error instanceof IdentityConflictError) {
        throw new AppError("CONFLICT", "Some fields are already in use.", {
          [error.field]: ["Is already in use."],
        });
      }
      throw error;
    }

    const body: AuthSessionResponse = {
      csrfToken: registered.credentials.csrfToken,
      user: toSessionUser(registered.user),
    };
    return reply
      .code(201)
      .header("cache-control", "no-store")
      .setCookie(
        SESSION_COOKIE_NAME,
        registered.credentials.token,
        sessionCookieOptions(dependencies.sessionCookie),
      )
      .send(body);
  });
}
