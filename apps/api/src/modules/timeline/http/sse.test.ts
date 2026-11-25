import { PassThrough } from "node:stream";

import { TIMELINE_LIVE_EVENT } from "@twitter-clone/contracts";
import { describe, expect, it } from "vitest";

import { writeSseComment, writeTimelineLiveEvent } from "./sse.js";

describe("US-F01 AC-F01.1 SSE framing", () => {
  it("writes the event name, signed id, and tweet id without content", () => {
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(String(chunk));
    });

    writeTimelineLiveEvent(stream, "v1.cursor.mac", {
      authorId: "author",
      createdAt: "2026-11-24T12:00:00.000000Z",
      tweetId: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
    });
    writeSseComment(stream);

    const body = chunks.join("");
    expect(body).toContain(`event: ${TIMELINE_LIVE_EVENT}\n`);
    expect(body).toContain("id: v1.cursor.mac\n");
    expect(body).toContain(
      'data: {"tweetId":"0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61"}\n\n',
    );
    expect(body).not.toContain("authorId");
    expect(body).not.toContain("secret");
    expect(body.endsWith(":\n\n")).toBe(true);
  });
});
