import { z } from "zod";

import { tweetSchema } from "./tweet";

export const TIMELINE_DEFAULT_LIMIT = 20;
export const TIMELINE_MAX_LIMIT = 30;
export const TIMELINE_CURSOR_MAX_LENGTH = 256;

/** SSE event name for a new home-timeline tweet (LIVE-01). Payload is ids only. */
export const TIMELINE_LIVE_EVENT = "timeline.tweet";

/** Missed tweets replayed after reconnect; same bound as a timeline page. */
export const TIMELINE_LIVE_CATCHUP_LIMIT = TIMELINE_MAX_LIMIT;

const cursor = z.string().min(1).max(TIMELINE_CURSOR_MAX_LENGTH);

/** GET /v1/timeline accepts positive decimal page sizes; larger sizes are capped. */
export const timelineQuerySchema = z.strictObject({
  cursor: cursor.optional(),
  limit: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform((s) => Math.min(Number(s), TIMELINE_MAX_LIMIT))
    .default(TIMELINE_DEFAULT_LIMIT),
});

/** A null cursor means that no further eligible row was visible in this read. */
export const timelinePageSchema = z.strictObject({
  items: z.array(tweetSchema).max(TIMELINE_MAX_LIMIT),
  nextCursor: cursor.nullable(),
});

/** Parsed viewer-specific page for GET /v1/timeline. */
export type TimelinePage = z.infer<typeof timelinePageSchema>;

/**
 * SSE `data` for {@link TIMELINE_LIVE_EVENT}. Clients must refetch
 * authoritative cards; this payload never includes tweet text.
 */
export const timelineLiveEventSchema = z.strictObject({
  tweetId: z.uuid(),
});

/** Parsed live timeline event. */
export type TimelineLiveEvent = z.infer<typeof timelineLiveEventSchema>;
