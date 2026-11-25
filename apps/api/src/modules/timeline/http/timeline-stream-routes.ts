import { TIMELINE_LIVE_CATCHUP_LIMIT } from "@twitter-clone/contracts";

import { authContext, type AuthGuard } from "../../auth/http/authentication.js";
import {
  type AuthRateLimit,
  authRateLimitConfig,
} from "../../auth/http/rate-limit.js";
import { InvalidTimelineCursorError } from "../application/read-timeline.js";
import { DEFAULT_TIMELINE_LIVE_HEARTBEAT_MS } from "../application/timeline-live-hub.js";

import { writeSseComment, writeTimelineLiveEvent } from "./sse.js";

import type { createReadTimelineSince } from "../application/read-timeline-since.js";
import type { TimelineCursor } from "../application/read-timeline.js";
import type {
  LiveTimelineTweet,
  TimelineLiveHub,
} from "../application/timeline-live-hub.js";
import type { FastifyInstance } from "fastify";
import type { OutgoingHttpHeaders } from "node:http";

/** Opening the stream, not the long-lived connection, is budgeted. */
export const DEFAULT_TIMELINE_STREAM_RATE_LIMIT: AuthRateLimit = {
  max: 30,
  timeWindowMs: 60_000,
};

export interface TimelineStreamDependencies {
  requireSession: AuthGuard;
  hub: TimelineLiveHub;
  events: TimelineCursor;
  readSince: ReturnType<typeof createReadTimelineSince>;
  corsOrigin: string;
  /** `0` disables comments; tests use that so the socket is quiet. */
  heartbeatMs?: number;
  catchUpLimit?: number;
  rateLimit?: AuthRateLimit;
}

/**
 * `GET /timeline/stream` (LIVE-01). Cookie session, no CSRF. Events carry
 * tweet ids only; `Last-Event-ID` is a signed live cursor for catch-up.
 *
 * The handler hijacks the raw response so Fastify does not buffer or wait for
 * the stream to end. CORS headers already decided by the plugin are copied.
 */
export async function timelineStreamRoutes(
  app: FastifyInstance,
  dependencies: TimelineStreamDependencies,
): Promise<void> {
  const heartbeatMs =
    dependencies.heartbeatMs ?? DEFAULT_TIMELINE_LIVE_HEARTBEAT_MS;
  const catchUpLimit = dependencies.catchUpLimit ?? TIMELINE_LIVE_CATCHUP_LIMIT;

  app.get(
    "/timeline/stream",
    {
      config: {
        rateLimit: authRateLimitConfig(
          dependencies.rateLimit ?? DEFAULT_TIMELINE_STREAM_RATE_LIMIT,
        ),
      },
      preHandler: dependencies.requireSession,
    },
    async (request, reply) => {
      const viewerId = authContext(request).user.id;
      request.raw.setTimeout(0);
      reply.raw.setTimeout(0);
      request.raw.socket?.setNoDelay(true);

      const socket = reply.raw;
      const push = (event: LiveTimelineTweet) => {
        writeTimelineLiveEvent(
          socket,
          dependencies.events.encode(viewerId, {
            createdAt: event.createdAt,
            id: event.tweetId,
          }),
          event,
        );
      };
      const connection = {
        close: () => {
          if (!socket.writableEnded) {
            socket.end();
          }
        },
        push,
      };
      const unsubscribe = dependencies.hub.subscribe(viewerId, connection);

      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const shutdown = () => {
        unsubscribe();
        if (heartbeat !== undefined) {
          clearInterval(heartbeat);
        }
        if (!socket.writableEnded) {
          socket.end();
        }
      };
      request.raw.on("close", shutdown);

      reply.hijack();
      socket.writeHead(
        200,
        sseHeaders(request.headers.origin, dependencies.corsOrigin),
      );
      socket.flushHeaders();

      if (heartbeatMs > 0) {
        heartbeat = setInterval(() => writeSseComment(socket), heartbeatMs);
        heartbeat.unref();
      }

      const lastEventId = request.headers["last-event-id"];
      if (typeof lastEventId === "string" && lastEventId.length > 0) {
        try {
          const after = dependencies.events.decode(viewerId, lastEventId);
          const page = await dependencies.readSince(
            viewerId,
            after,
            catchUpLimit,
          );
          for (const item of chronological(page.items)) {
            push({
              authorId: item.author.id,
              createdAt: item.createdAt,
              tweetId: item.id,
            });
          }
        } catch (error: unknown) {
          if (!(error instanceof InvalidTimelineCursorError)) {
            request.log.error({ err: error }, "timeline live catch-up failed");
            shutdown();
            return;
          }
          // Tampered or foreign ids must not 400: EventSource would retry the
          // same header forever. Skip catch-up and stay on this viewer's feed.
        }
      }
    },
  );
}

function sseHeaders(
  origin: string | string[] | undefined,
  corsOrigin: string,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {
    "cache-control": "no-store",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
  };
  if (origin === corsOrigin) {
    headers["access-control-allow-credentials"] = "true";
    headers["access-control-allow-origin"] = corsOrigin;
    headers.vary = "Origin";
  }
  return headers;
}

function chronological<T extends { createdAt: string; id: string }>(
  items: readonly T[],
): T[] {
  return [...items].reverse();
}
