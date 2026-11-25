import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createTweetResponseSchema,
  errorResponseSchema,
  threadPageSchema,
  timelinePageSchema,
  uploadIntentResponseSchema,
} from "@twitter-clone/contracts";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { fastPasswordHasher } from "../../tests/fast-password-hasher.js";
import { startTestDatabase, type TestDatabase } from "../../tests/postgres.js";
import { tweets } from "../tweets/infrastructure/tweets.schema.js";

import { createLocalObjectStore } from "./infrastructure/local-object-store.js";
import { mediaUploads } from "./infrastructure/media.schema.js";

import type { FastifyInstance } from "fastify";

const PASSWORD = "correct horse battery";
let now = new Date("2026-11-24T12:00:00.000Z");
let database: TestDatabase;
let app: FastifyInstance;
let storageDir: string;

beforeAll(async () => {
  storageDir = await mkdtemp(join(tmpdir(), "tweet-images-"));
  database = await startTestDatabase();
  app = await buildApp({
    auth: {
      clock: () => now,
      db: database.db,
      passwordHasher: fastPasswordHasher,
      rateLimit: { max: 1_000, timeWindowMs: 60_000 },
      sessionCookie: { domain: undefined, secure: true, ttlSeconds: 3_600 },
      sessionSecret: "test-secret-with-at-least-32-characters",
    },
    corsOrigin: "http://localhost:3000",
    mediaOrigin: "http://127.0.0.1:4000",
    tweetWriteRateLimit: { max: 1_000, timeWindowMs: 60_000 },
    uploads: { storageDir },
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await database?.stop();
  await rm(storageDir, { force: true, recursive: true });
});

interface Member {
  csrfToken: string;
  token: string;
}

async function register(username: string): Promise<Member> {
  const response = await app.inject({
    method: "POST",
    payload: { email: `${username}@example.com`, password: PASSWORD, username },
    url: "/v1/auth/register",
  });
  expect(response.statusCode).toBe(201);
  return {
    csrfToken: response.json().csrfToken as string,
    token:
      response.cookies.find((cookie) => cookie.name === "sid")?.value ?? "",
  };
}

const png = async () =>
  sharp({
    create: {
      background: { b: 0, g: 0, r: 255 },
      channels: 3,
      height: 2,
      width: 3,
    },
  })
    .png()
    .toBuffer();

async function intent(
  member: Member | null,
  body: unknown,
  csrf: string | null = member?.csrfToken ?? null,
) {
  return app.inject({
    cookies: member === null ? {} : { sid: member.token },
    headers: csrf === null ? {} : { "x-csrf-token": csrf },
    method: "POST",
    payload: body as object,
    url: "/v1/media/upload-intents",
  });
}

async function upload(
  member: Member,
  uploadId: string,
  token: string,
  bytes: Buffer,
  csrf = member.csrfToken,
) {
  return app.inject({
    cookies: { sid: member.token },
    headers: {
      "content-type": "application/octet-stream",
      ...(csrf === undefined ? {} : { "x-csrf-token": csrf }),
      "x-upload-token": token,
    },
    method: "PUT",
    payload: bytes,
    url: `/v1/media/uploads/${uploadId}/content`,
  });
}

let ada: Member;
let grace: Member;

beforeEach(async () => {
  now = new Date("2026-11-24T12:00:00.000Z");
  await database.reset();
  ada = await register("ada");
  grace = await register("grace");
});

describe("IMG-01 tweet images", () => {
  it("US-F02 AC-F02.1 rejects guests, missing CSRF, and a type that is not an image we accept", async () => {
    const bytes = await png();
    expect(
      (await intent(null, { byteSize: bytes.length, mimeType: "image/png" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await intent(
          ada,
          { byteSize: bytes.length, mimeType: "image/png" },
          null,
        )
      ).statusCode,
    ).toBe(403);
    const gif = await intent(ada, { byteSize: 12, mimeType: "image/gif" });
    expect(gif.statusCode).toBe(422);
    expect(errorResponseSchema.parse(gif.json()).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("US-F02 AC-F02.2 rejects bytes that are not the declared image and does not publish them", async () => {
    const text = Buffer.from("not an image");
    const created = uploadIntentResponseSchema.parse(
      (
        await intent(ada, { byteSize: text.length, mimeType: "image/png" })
      ).json(),
    );
    const rejected = await upload(
      ada,
      created.uploadId,
      created.uploadToken,
      text,
    );
    expect(rejected.statusCode).toBe(422);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/media/objects/${created.uploadId}`,
        })
      ).statusCode,
    ).toBe(404);
  });

  it("US-F02 AC-F02.3 attaches one owned image and refuses a second use or another member", async () => {
    const bytes = await png();
    const created = uploadIntentResponseSchema.parse(
      (
        await intent(ada, { byteSize: bytes.length, mimeType: "image/png" })
      ).json(),
    );
    expect(created.uploadPath).toBe(
      `/v1/media/uploads/${created.uploadId}/content`,
    );
    expect(
      (await upload(ada, created.uploadId, created.uploadToken, bytes))
        .statusCode,
    ).toBe(204);
    expect(
      (await upload(grace, created.uploadId, created.uploadToken, bytes))
        .statusCode,
    ).toBe(422);

    const hidden = await app.inject({
      method: "GET",
      url: `/v1/media/objects/0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f99`,
    });
    expect(hidden.statusCode).toBe(404);

    const posted = await app.inject({
      cookies: { sid: ada.token },
      headers: { "x-csrf-token": ada.csrfToken },
      method: "POST",
      payload: {
        content: "A red square",
        image: { alt: "Red square", uploadId: created.uploadId },
      },
      url: "/v1/tweets",
    });
    expect(posted.statusCode).toBe(201);
    const { tweet } = createTweetResponseSchema.parse(posted.json());
    expect(tweet.image).toMatchObject({
      alt: "Red square",
      height: 2,
      width: 3,
    });
    const objectKey = tweet.image?.url.split("/").at(-1) ?? "";
    const image = await app.inject({
      method: "GET",
      url: `/v1/media/objects/${objectKey}`,
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/png");
    expect(image.headers["x-content-type-options"]).toBe("nosniff");
    expect(image.headers["content-disposition"]).toBe(
      'inline; filename="image.png"',
    );
    expect(image.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(image.rawPayload.subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );

    const stolen = await app.inject({
      cookies: { sid: grace.token },
      headers: { "x-csrf-token": grace.csrfToken },
      method: "POST",
      payload: {
        content: "Not mine",
        image: { alt: "Red square", uploadId: created.uploadId },
      },
      url: "/v1/tweets",
    });
    expect(stolen.statusCode).toBe(422);
    const again = await app.inject({
      cookies: { sid: ada.token },
      headers: { "x-csrf-token": ada.csrfToken },
      method: "POST",
      payload: {
        content: "Again",
        image: { alt: "Red square", uploadId: created.uploadId },
      },
      url: "/v1/tweets",
    });
    expect(again.statusCode).toBe(422);
    expect(await database.db.$count(tweets)).toBe(1);

    const timeline = timelinePageSchema.parse(
      (
        await app.inject({
          cookies: { sid: ada.token },
          method: "GET",
          url: "/v1/timeline",
        })
      ).json(),
    );
    expect(timeline.items[0]?.image?.alt).toBe("Red square");
    const thread = threadPageSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/v1/tweets/${tweet.id}/thread`,
        })
      ).json(),
    );
    expect(thread.selected.image?.alt).toBe("Red square");
  });

  it("US-F02 AC-F02.5 deletes the object with the tweet and drops an expired upload", async () => {
    const bytes = await png();
    const created = uploadIntentResponseSchema.parse(
      (
        await intent(ada, { byteSize: bytes.length, mimeType: "image/png" })
      ).json(),
    );
    await upload(ada, created.uploadId, created.uploadToken, bytes);
    const posted = await app.inject({
      cookies: { sid: ada.token },
      headers: { "x-csrf-token": ada.csrfToken },
      method: "POST",
      payload: {
        content: "Gone soon",
        image: { alt: "Red square", uploadId: created.uploadId },
      },
      url: "/v1/tweets",
    });
    const { tweet } = createTweetResponseSchema.parse(posted.json());
    const objectKey = tweet.image?.url.split("/").at(-1) ?? "";
    const removed = await app.inject({
      cookies: { sid: ada.token },
      headers: { "x-csrf-token": ada.csrfToken },
      method: "DELETE",
      url: `/v1/tweets/${tweet.id}`,
    });
    expect(removed.statusCode).toBe(204);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/media/objects/${objectKey}`,
        })
      ).statusCode,
    ).toBe(404);
    const store = createLocalObjectStore(storageDir);
    await expect(store.get(objectKey)).resolves.toBeNull();

    const stale = uploadIntentResponseSchema.parse(
      (
        await intent(ada, { byteSize: bytes.length, mimeType: "image/png" })
      ).json(),
    );
    now = new Date(now.getTime() + 16 * 60 * 1000);
    await intent(ada, { byteSize: bytes.length, mimeType: "image/png" });
    const [row] = await database.db
      .select({ id: mediaUploads.id })
      .from(mediaUploads)
      .where(eq(mediaUploads.id, stale.uploadId));
    expect(row).toBeUndefined();
    expect(
      (await upload(ada, stale.uploadId, stale.uploadToken, bytes)).statusCode,
    ).toBe(422);
  });
});
