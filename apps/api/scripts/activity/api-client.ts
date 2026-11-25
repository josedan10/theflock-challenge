import {
  authSessionResponseSchema,
  createTweetResponseSchema,
  uploadIntentResponseSchema,
} from "@twitter-clone/contracts";

/** A logged-in demo account. Kept in memory only; never logged. */
export interface ApiSession {
  cookie: string;
  csrfToken: string;
}

/** A failed API call. Only the status is kept, so nothing private reaches a log. */
export class ActivityApiError extends Error {
  constructor(
    readonly action: string,
    readonly status: number,
  ) {
    super(`${action} failed with HTTP ${status}.`);
    this.name = "ActivityApiError";
  }
}

export interface NewActivityTweet {
  content: string;
  parentTweetId: string | null;
  image: { alt: string; bytes: Buffer } | null;
}

async function expectStatus(
  response: Response,
  action: string,
  status: number,
): Promise<void> {
  if (response.status !== status) {
    await response.body?.cancel();
    throw new ActivityApiError(action, response.status);
  }
}

/** Logs in through the public endpoint, exactly as the web app does. */
export async function logIn(
  origin: string,
  email: string,
  password: string,
): Promise<ApiSession> {
  const response = await fetch(`${origin}/v1/auth/login`, {
    body: JSON.stringify({ email, password }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  await expectStatus(response, "Login", 200);
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0] ?? "")
    .find((pair) => pair.startsWith("sid="));
  if (cookie === undefined) {
    throw new ActivityApiError("Login", response.status);
  }
  const body = authSessionResponseSchema.parse(await response.json());
  return { cookie, csrfToken: body.csrfToken };
}

function authHeaders(session: ApiSession): Record<string, string> {
  return { cookie: session.cookie, "x-csrf-token": session.csrfToken };
}

/** Uploads a PNG. Returns null when uploads are switched off on the API. */
async function uploadPng(
  origin: string,
  session: ApiSession,
  bytes: Buffer,
): Promise<string | null> {
  const intent = await fetch(`${origin}/v1/media/upload-intents`, {
    body: JSON.stringify({ byteSize: bytes.length, mimeType: "image/png" }),
    headers: { ...authHeaders(session), "content-type": "application/json" },
    method: "POST",
  });
  if (intent.status === 404) {
    await intent.body?.cancel();
    return null;
  }
  await expectStatus(intent, "Upload intent", 201);
  const grant = uploadIntentResponseSchema.parse(await intent.json());
  const upload = await fetch(`${origin}${grant.uploadPath}`, {
    body: new Uint8Array(bytes),
    headers: {
      ...authHeaders(session),
      "content-type": "application/octet-stream",
      "x-upload-token": grant.uploadToken,
    },
    method: "PUT",
  });
  await expectStatus(upload, "Upload", 204);
  return grant.uploadId;
}

/** Likes a tweet. Liking it again is a no-op on the API. */
export async function likeTweet(
  origin: string,
  session: ApiSession,
  tweetId: string,
): Promise<void> {
  const response = await fetch(
    `${origin}/v1/tweets/${encodeURIComponent(tweetId)}/like`,
    { headers: authHeaders(session), method: "PUT" },
  );
  await expectStatus(response, "Like", 200);
  await response.body?.cancel();
}

/**
 * Posts a tweet or reply through the public API, so mentions, notifications,
 * images and the live timeline behave as for a real member.
 */
export async function postTweet(
  origin: string,
  session: ApiSession,
  tweet: NewActivityTweet,
): Promise<string> {
  const uploadId =
    tweet.image === null
      ? null
      : await uploadPng(origin, session, tweet.image.bytes);
  const path =
    tweet.parentTweetId === null
      ? "/v1/tweets"
      : `/v1/tweets/${encodeURIComponent(tweet.parentTweetId)}/replies`;
  const response = await fetch(`${origin}${path}`, {
    body: JSON.stringify({
      content: tweet.content,
      ...(uploadId === null || tweet.image === null
        ? {}
        : { image: { alt: tweet.image.alt, uploadId } }),
    }),
    headers: { ...authHeaders(session), "content-type": "application/json" },
    method: "POST",
  });
  await expectStatus(response, "Post", 201);
  return createTweetResponseSchema.parse(await response.json()).tweet.id;
}
