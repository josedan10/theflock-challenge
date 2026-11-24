import { authContext, type AuthGuard } from "./authentication.js";
import { toSessionUser } from "./session-user.js";

import type { SessionCredentialGenerator } from "../application/ports.js";
import type { AuthSessionResponse } from "@twitter-clone/contracts";
import type { FastifyInstance } from "fastify";

export interface MeRouteDependencies {
  requireSession: AuthGuard;
  credentials: SessionCredentialGenerator;
}

/**
 * `GET /me`: the current member plus their CSRF token, re-derived from the
 * session cookie so a reloaded client can keep sending mutations.
 */
export async function meRoute(
  app: FastifyInstance,
  dependencies: MeRouteDependencies,
): Promise<void> {
  app.get(
    "/me",
    { preHandler: dependencies.requireSession },
    async (request, reply) => {
      const auth = authContext(request);
      const body: AuthSessionResponse = {
        csrfToken: dependencies.credentials.csrfTokenFor(auth.sessionToken),
        user: toSessionUser(auth.user),
      };
      return reply.header("cache-control", "no-store").send(body);
    },
  );
}
