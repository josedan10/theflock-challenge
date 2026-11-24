import {
  type ErrorCode,
  type ErrorResponse,
  errorStatusByCode,
} from "@twitter-clone/contracts";
import { DrizzleQueryError } from "drizzle-orm";

import type { FastifyError, FastifyInstance } from "fastify";

/**
 * An expected failure whose code, message, and fields are safe to return to
 * the requester. Anything else thrown from a route becomes a generic 500.
 */
export class AppError extends Error {
  override readonly name = "AppError";

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }

  get statusCode(): number {
    return errorStatusByCode[this.code];
  }
}

function envelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  fields?: Record<string, string[]>,
): ErrorResponse {
  return {
    error: {
      code,
      message,
      ...(fields === undefined ? {} : { fields }),
      requestId,
    },
  };
}

function isFastifyClientError(error: unknown): error is FastifyError {
  const statusCode = (error as Partial<FastifyError> | null)?.statusCode;
  return (
    typeof statusCode === "number" && statusCode >= 400 && statusCode < 500
  );
}

/**
 * Renders every failure as the contract error envelope.
 *
 * Framework client errors (malformed JSON, oversized or unsupported bodies)
 * keep their HTTP status but are reported as `MALFORMED_REQUEST` with a fixed
 * message, so parser internals never reach the client. Server errors are
 * logged by category only and returned as an opaque `INTERNAL_ERROR`.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send(envelope(error.code, error.message, request.id, error.fields));
    }

    if (isFastifyClientError(error)) {
      if (error.statusCode === errorStatusByCode.RATE_LIMITED) {
        return reply
          .code(error.statusCode)
          .send(
            envelope(
              "RATE_LIMITED",
              "Too many requests. Try again later.",
              request.id,
            ),
          );
      }
      return reply
        .code(error.statusCode ?? errorStatusByCode.MALFORMED_REQUEST)
        .send(
          envelope(
            "MALFORMED_REQUEST",
            "The request could not be processed.",
            request.id,
          ),
        );
    }

    // Driver messages, stack traces and nested causes can contain SQL, bound
    // parameters and credentials. The request-scoped logger already carries reqId.
    request.log.error(
      {
        failureKind:
          error instanceof DrizzleQueryError ? "database_query" : "unexpected",
        route: request.routeOptions.url ?? "(unmatched)",
      },
      "unhandled request error",
    );
    return reply
      .code(errorStatusByCode.INTERNAL_ERROR)
      .send(envelope("INTERNAL_ERROR", "Something went wrong.", request.id));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .code(errorStatusByCode.NOT_FOUND)
      .send(
        envelope(
          "NOT_FOUND",
          "The requested resource does not exist.",
          request.id,
        ),
      ),
  );
}
