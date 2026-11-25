# Initial API contract

OpenAPI will become executable truth during implementation. This document defines the first route inventory and conventions.

## Conventions

- Base: `/v1`; JSON `Content-Type`; ISO-8601 UTC timestamps; authenticated browser requests include credentials.
- Cookie: opaque session. Mutations also send `X-CSRF-Token`.
- Pagination response: `{ "items": [...], "nextCursor": "opaque-or-null" }`.
- Success uses `200`, creation `201`, deletion `204`.
- Errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "fields": { "username": ["Must contain 3–30 valid characters."] },
    "requestId": "01..."
  }
}
```

Status semantics: `400` malformed cursor/request, `401` unauthenticated, `403` authenticated but forbidden, `404` absent, `409` uniqueness/conflict, `422` domain/field invalid, `429` rate limited.

## Routes

| Method | Route                           |             Auth | Purpose                                       |
| ------ | ------------------------------- | ---------------: | --------------------------------------------- |
| POST   | `/auth/register`                |               no | Create user and session                       |
| POST   | `/auth/login`                   |               no | Create/rotate session                         |
| POST   | `/auth/logout`                  |              yes | Revoke current session                        |
| GET    | `/me`                           |              yes | Current user/session-safe profile             |
| PATCH  | `/me/profile`                   |              yes | Edit display name/bio/avatar key when enabled |
| GET    | `/users/:username`              |         optional | Public profile                                |
| GET    | `/users/:username/tweets`       |         optional | Profile tweet page                            |
| GET    | `/users/:username/followers`    |         optional | Cursor-paginated followers                    |
| GET    | `/users/:username/following`    |         optional | Cursor-paginated following                    |
| PUT    | `/users/:username/follow`       |              yes | Idempotently follow                           |
| DELETE | `/users/:username/follow`       |              yes | Idempotently unfollow                         |
| GET    | `/users/search?q=`              |              yes | Search public user fields                     |
| POST   | `/tweets`                       |              yes | Create tweet                                  |
| POST   | `/tweets/:id/replies`           |              yes | Reply to a visible tweet or reply             |
| GET    | `/tweets/:id/thread`            |         optional | Selected tweet and paged descendants          |
| DELETE | `/tweets/:id`                   |              yes | Delete own tweet                              |
| PUT    | `/tweets/:id/like`              |              yes | Idempotently like                             |
| DELETE | `/tweets/:id/like`              |              yes | Idempotently unlike                           |
| GET    | `/timeline?cursor=&limit=`      |              yes | Home timeline                                 |
| GET    | `/timeline/stream`              |              yes | SSE live tweet ids for the home timeline      |
| GET    | `/notifications?cursor=&limit=` |              yes | The member's notifications                    |
| GET    | `/notifications/unread-count`   |              yes | Unread badge count                            |
| POST   | `/notifications/read`           |              yes | Mark ids or all read                          |
| GET    | `/health/live`                  |               no | Process liveness only                         |
| GET    | `/health/ready`                 | internal/limited | Dependency readiness, no secret details       |

Follow responses return `{ relationship: { following, followerCount } }`. Like responses return `{ like: { liked, likeCount } }`. Create tweet returns the complete card view model so the client does not invent timestamps/counts.

## Registration (`POST /v1/auth/register`)

Request (validated by `registerRequestSchema` in `@twitter-clone/contracts`):

```json
{
  "email": "Ada@Example.com",
  "username": "Ada_Lovelace",
  "password": "correct horse battery",
  "displayName": "Ada"
}
```

`displayName` is optional and defaults to the username as entered. Email and username are trimmed; uniqueness compares lowercase forms, and the username is stored lowercase.

| Status | Body                                                            | Notes                                                        |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| `201`  | `{ "user": SessionUser, "csrfToken": string }`                  | Sets the `sid` cookie; `Cache-Control: no-store`             |
| `409`  | Error envelope, `CONFLICT`, `fields.email` or `fields.username` | One field per response: the first unique constraint violated |
| `422`  | Error envelope, `VALIDATION_ERROR`, `fields` per invalid field  | Nothing is written                                           |
| `400`  | Error envelope, `MALFORMED_REQUEST`                             | Unparseable JSON                                             |
| `429`  | Error envelope, `RATE_LIMITED`, `Retry-After` header            | 5 attempts/minute per client address                         |

`SessionUser` never contains the email, password hash, or session material. Session cookie: `sid`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=SESSION_TTL_SECONDS`, `Secure` when `COOKIE_SECURE=true` (required in production), `Domain=COOKIE_DOMAIN` when set. The `csrfToken` must be sent as `X-CSRF-Token` on cookie-authenticated mutations.

## Login, logout, and current member

- `POST /v1/auth/login` with `{ "email", "password" }`: `200` with the same body and `sid` cookie as registration. Any session cookie sent with the login is revoked, so login always rotates to a fresh session. A wrong password and an unknown email get the identical `401 UNAUTHENTICATED` ("Invalid email or password."), with no `fields` and no cookie. Shares the registration rate limit.
- `POST /v1/auth/logout`: revokes the current session and clears the cookie, answering `204`. An active session requires `X-CSRF-Token` (`403 FORBIDDEN` otherwise). It is idempotent: with no active session it still answers `204` and clears the cookie.
- `GET /v1/me`: `200` with `{ "user": SessionUser, "csrfToken": string }` for an active session, or `401 UNAUTHENTICATED`. Clients call it after a reload to recover the CSRF token.

## Profile (`GET /v1/users/:username`, `PATCH /v1/me/profile`)

v1 profiles are public (requirements rule 10, PROFILE-01, US-A03). A viewer does not need a session, and a stale session cookie does not block the read. The response is `Cache-Control: no-store`.

```json
{
  "profile": {
    "id": "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
    "username": "ada_lovelace",
    "displayName": "Ada",
    "bio": "",
    "avatarUrl": null,
    "tweetCount": 0,
    "followerCount": 0,
    "followingCount": 0,
    "createdAt": "2026-11-24T12:00:00.000Z"
  }
}
```

`avatarUrl` is `null` until image upload exists; clients render a placeholder. The document never includes `avatarKey`, email, or password material. Username lookup is case-insensitive and uses the stored lowercase form. Unknown, malformed, and soft-deleted usernames all return `404 NOT_FOUND` with the message "That profile does not exist." and no profile body.

`tweetCount`, `followerCount`, and `followingCount` are computed from committed rows. No denormalized counters are stored.

Bio is plain text. The API stores it and returns it as a JSON string; it does not interpret or strip markup. Clients must render it as text (AC-A03.3). Reads are limited to 120 attempts per minute per client address.

`PATCH /v1/me/profile` edits the authenticated member only (PROFILE-02). There is no route that edits another member. Send `X-CSRF-Token`. At least one of `displayName` (1–80 code points) or `bio` (0–160 code points, empty allowed) is required; omitted fields stay as stored. Both are trimmed. A null character is rejected. Unknown properties (`email`, `username`, `userId`, `password`, `avatarKey`) are `422` and nothing is written. Avatar keys stay disabled until an upload can prove the caller owns the object.

| Status | Body                                          | Notes                                         |
| ------ | --------------------------------------------- | --------------------------------------------- |
| `200`  | `{ "profile": PublicProfile }`                | `Cache-Control: no-store`                     |
| `401`  | Error envelope, `UNAUTHENTICATED`             | Missing, unknown, expired, or revoked session |
| `403`  | Error envelope, `FORBIDDEN`                   | Missing or wrong `X-CSRF-Token`               |
| `422`  | Error envelope, `VALIDATION_ERROR`            | Invalid field or unknown property             |
| `429`  | Error envelope, `RATE_LIMITED`, `Retry-After` | 20 attempts/minute per client address         |

## Follow (`PUT /v1/users/:username/follow`, `DELETE /v1/users/:username/follow`)

Both require a session and `X-CSRF-Token` (US-C01, SOCIAL-01). The follower is the session member; a body cannot name one, and an empty body is valid. The username is matched case-insensitively to the stored lowercase form. Unknown, malformed, and soft-deleted usernames all return `404 NOT_FOUND` ("That profile does not exist."), the same answer as a profile read.

`200` (`followResponseSchema`), with `Cache-Control: no-store`:

```json
{
  "relationship": {
    "following": true,
    "followerCount": 1
  }
}
```

`following` is the session member's relationship to the target after the command commits. `followerCount` is that target's follower count from committed rows (requirements rule 8). PUT inserts the edge when it is absent (`INSERT ... ON CONFLICT DO NOTHING` on the composite primary key). A repeat PUT stays `200`, keeps the original `created_at`, and does not increase the count. DELETE removes the edge when it is present. A repeat DELETE stays `200` with `following: false` and the current count. Unfollow is not `204`: the client needs the count to reconcile.

Self-follow and self-unfollow return `422 VALIDATION_ERROR` with `fields.username` ("You cannot follow yourself.") and write nothing. The `follows` check `follower_id <> following_id` repeats that rule. A foreign-key failure, such as the target disappearing during the command, is the same `404` as an unknown username.

| Status | Meaning                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------- |
| `200`  | Relationship applied, or already in the requested state                                                   |
| `401`  | Missing, unknown, expired, or revoked session                                                             |
| `403`  | Missing or wrong CSRF token                                                                               |
| `404`  | Unknown, malformed, or soft-deleted username                                                              |
| `422`  | The member named themselves                                                                               |
| `429`  | 60 attempts/minute per client address, with `Retry-After`; follow and unfollow each have their own budget |

Following makes the target's existing tweets eligible for the follower's next home-timeline read (AC-C01.3). Unfollow removes that eligibility on the next read. Issued cursors are not rewritten. SOC-01 adds no migration: the `follows` table already exists. To roll the API back, stop serving these routes and leave the table in place.

## People search (`GET /v1/users/search?q=&limit=`)

Members only (US-D01): no session is `401`. `q` is trimmed and must be 2–50 characters counted as code points; shorter, longer, blank, or NUL-containing text, an invalid `limit`, or an unknown parameter is `422 VALIDATION_ERROR` with the field named (AC-D01.4). `limit` defaults to 20 and is capped at 30. Results are capped, not paginated (AC-D01.3).

Matching is case-insensitive over username and display name, and literal: `%`, `_` and `\` are escaped and match only themselves. Order (AC-D01.2): exact username, username prefix, display-name prefix, then any other substring; ties order by username, so results are deterministic. Soft-deleted members never match.

`200` (`userSearchResponseSchema`), `Cache-Control: no-store`. Items have the follow-list row shape: public `user` fields plus `followedByViewer` and `isViewer`. Email, password hashes and storage keys are never selected. The search text is not logged (request logs record only the route template). Searches allow 60 per minute per client address.

The username `search` is reserved at registration, because `/v1/users/search` would otherwise hide that member's profile.

## Followers and following (`GET /v1/users/:username/followers`, `GET /v1/users/:username/following`)

Public reads (US-C03). A session is optional: an active `sid` cookie adds the viewer's relationship to each row, and a missing, expired or revoked one is treated as signed out, never `401`. The username is matched case-insensitively. Unknown, malformed and soft-deleted usernames return `404 NOT_FOUND` ("That profile does not exist.").

`200` (`followListPageSchema`), with `Cache-Control: no-store` because rows depend on the viewer:

```json
{
  "items": [
    {
      "user": {
        "id": "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
        "username": "grace",
        "displayName": "Grace",
        "avatarUrl": null
      },
      "followedByViewer": true,
      "isViewer": false
    }
  ],
  "nextCursor": "v1.<payload>.<mac>"
}
```

Members are ordered by when the follow edge was created, newest first; ties order by member id, matching the composite follow indexes, so each page is an index range scan. Each member appears once (AC-C03.1): the follow primary key allows one edge per pair and the strict keyset never repeats its anchor. Soft-deleted members are skipped. `followedByViewer` is whether the signed-in viewer follows that member (`false` when signed out). `isViewer` marks the viewer's own row, which gets no follow control.

`cursor` and `limit` follow the home-timeline rules: omit `cursor` on the first page, pass it back unchanged, and `null` means the end (AC-C03.2). `limit` defaults to 20 and is capped at 30. The cursor is signed under a follow-list key and scoped to the direction and member, not the viewer, because the lists are public: a cursor from another list or member is `400 MALFORMED_REQUEST`, as is any invalid or repeated query parameter. Reads allow 120 per minute per client address. No migration: these reads use the existing follow indexes.

## Like (`PUT /v1/tweets/:id/like`, `DELETE /v1/tweets/:id/like`)

Both require a session and `X-CSRF-Token` (US-C02). The member is the session member; a body cannot name one, and an empty body is valid. Any member may like any tweet, including their own. Unknown, malformed, and deleted tweet ids all return `404 NOT_FOUND` ("That tweet does not exist."), the same answer as deleting a missing tweet.

`200` (`likeResponseSchema`), with `Cache-Control: no-store`:

```json
{
  "like": {
    "liked": true,
    "likeCount": 1
  }
}
```

`liked` is the session member's state for the tweet after the command commits. `likeCount` is that tweet's like count from committed rows (requirements rule 8), the same values a timeline card reports as `likedByViewer` and `likeCount`. PUT inserts the like when it is absent (`INSERT ... ON CONFLICT DO NOTHING` on the `(user_id, tweet_id)` primary key). A repeat PUT stays `200`, keeps the original `created_at`, and does not increase the count. DELETE removes the like when it is present; a repeat DELETE stays `200` with `liked: false` and the current count. Unlike is not `204`: the client needs the count to reconcile (AC-C02.2).

Concurrency (AC-C02.4): there is no stored counter, so the count cannot drift or go negative; it is always `count(*)` of the rows. Each command share-locks the tweet row, so likers do not block each other while a concurrent tweet delete waits for them, then cascades their likes away. A like that arrives after the delete is a `404`. A foreign-key failure, such as the member disappearing during the command, is the same `404`.

| Status | Meaning                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------- |
| `200`  | Like applied, or already in the requested state                                                       |
| `401`  | Missing, unknown, expired, or revoked session                                                         |
| `403`  | Missing or wrong CSRF token                                                                           |
| `404`  | Unknown, malformed, or deleted tweet id                                                               |
| `429`  | 60 attempts/minute per client address, with `Retry-After`; like and unlike each have their own budget |

SOC-02 adds no migration: the `likes` table already exists. To roll the API back, stop serving these routes and leave the table in place.

## Tweets (`POST /v1/tweets`, `DELETE /v1/tweets/:id`)

Both routes require a session and `X-CSRF-Token`. The author is always the session member; the body cannot name one.

`POST /v1/tweets` takes `{ "content": string }` (validated by `createTweetRequestSchema`). Content is trimmed, must not be empty or whitespace-only, and is limited to 280 characters (code points, so each emoji counts once). Unknown keys are rejected.

| Status | Body                                 | Notes                                                                                                                                                       |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `201`  | `{ "tweet": Tweet }`                 | The complete card: `id`, `content`, `createdAt`, `author { id, username, displayName, avatarUrl }`, `likeCount`, `likedByViewer`; `Cache-Control: no-store` |
| `422`  | `VALIDATION_ERROR`, `fields.content` | Nothing is stored                                                                                                                                           |
| `401`  | `UNAUTHENTICATED`                    | No, expired, or revoked session                                                                                                                             |
| `403`  | `FORBIDDEN`                          | Missing or wrong CSRF token                                                                                                                                 |

`DELETE /v1/tweets/:id` deletes the session member's own tweet. The ownership check and the delete run in one transaction.

| Status | Meaning                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------- |
| `204`  | Deleted                                                                                            |
| `403`  | Someone else's tweet (`FORBIDDEN`), or a missing or wrong CSRF token                               |
| `404`  | Unknown, already deleted, or malformed id (`NOT_FOUND`); repeat deletes are not treated as success |
| `401`  | No valid session                                                                                   |

Tweet text is plain text that clients escape, and it is never logged: logs carry ids only. The basic write limit is 20 per minute per client, applied to create and to delete separately (set by `TWEET_RATE_LIMIT_PER_MINUTE`). Profiles now count committed tweets in `tweetCount`.

## Tweet images (`IMG-01` / US-F02)

Off unless `UPLOADS_ENABLED=true`. The web control is shown only when `NEXT_PUBLIC_UPLOADS_ENABLED=true`. One JPEG, PNG, or WebP per tweet or reply, at most 5 MiB and 4096 pixels on each edge. The composer does not collect a description; the stored text alternative is empty.

1. `POST /v1/media/upload-intents` with `{ "mimeType", "byteSize" }` requires a session and `X-CSRF-Token`. `201` returns `{ uploadId, uploadToken, uploadPath, expiresAt }` for 15 minutes. The token is a secret shown once. Logs record ids only.
2. `PUT` `uploadPath` with `Content-Type: application/octet-stream`, `X-CSRF-Token`, and `X-Upload-Token`. The body length must equal `byteSize`. The API decodes the image, rejects a mismatch, animation, or oversized result, rewrites the bytes, and answers `204`. A failed image is not readable. Another member's upload is `422` with the message "That image is not available."
3. `POST /v1/tweets` may include `image: { "uploadId", "alt" }`. The tweet and the image row commit together. Reusing an upload, or one the member does not own, is `422` and stores no tweet. While uploads are off, `image` is `422`.
4. Cards gain `image: { url, alt, width, height } | null`. `url` uses `PUBLIC_API_ORIGIN` plus `/v1/media/objects/:objectKey`. That GET needs no session. It is `404` until a tweet references the object, and `404` again after the tweet is deleted. The response sets the verified image type, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="image.<ext>"`, and `Cross-Origin-Resource-Policy: cross-origin`.

Limits follow OWASP ASVS 5.0.0 V5.2.1, V5.2.2, and V5.2.6. Paths are server-generated ids (V5.3.2). Objects are not executed (V5.3.1). There is no antivirus scan (V5.4.3); rewriting the image is the local mitigation. There is no per-member storage quota (V5.2.4 is level 3); size and the 20/minute intent and upload budgets are the limits. Expired unattached uploads are deleted when the next intent is created. Deleting a tweet deletes its object after the database commit. Rollback: stop the routes and leave the additive tables; forward-fix rather than dropping stored images.

## Home timeline (`GET /v1/timeline`)

Requires a live session; no CSRF token is needed for this read. Returns `200 { items: Tweet[], nextCursor: string | null }` with `Cache-Control: no-store`. Cards contain only the member's and currently followed authors' tweets, newest first (ties: descending tweet ID), with committed like counts and the session member's liked state.

Omit `cursor` on the first page. Pass the returned cursor unchanged for the next page; `null` means the end. A cursor is signed and bound to its viewer. The strict keyset survives deletion of its anchor and does not shift under newer inserts; following changes take effect on the next request. `limit` defaults to 20; positive decimal integers above 30 are clamped to 30. Invalid, unknown or repeated parameters and bad or cross-viewer cursors return `400 MALFORMED_REQUEST`. Missing, expired or revoked sessions return `401 UNAUTHENTICATED`. The read limit is 120 per minute per client address. Rotating `SESSION_SECRET` invalidates outstanding cursors; restart pagination without one.

## Live home timeline (`GET /v1/timeline/stream`)

LIVE-01 / US-F01. Same session cookie as other member reads; no CSRF token (this is not a mutation). Response `200` is `text/event-stream` with `Cache-Control: no-store`. Each event:

- `event`: `timeline.tweet`
- `data`: `{ "tweetId": "<uuid>" }` only — never tweet text, authors, or counts
- `id`: a signed live cursor bound to this viewer (not a pagination cursor)

The browser's EventSource reconnects with `Last-Event-ID`. The server then emits at most 30 missed eligible tweet ids, oldest of that window first, and resumes live events. A tampered, foreign, or pagination cursor used as `Last-Event-ID` does not fail the stream (EventSource would otherwise retry that header forever) and never expands eligibility. Unauthenticated opens are `401`. Opening the stream is limited to 30 attempts per minute per client address. At most eight connections per member are kept; a ninth evicts the oldest.

Clients refetch `GET /v1/timeline` for authoritative cards, merge by tweet id, and must not move keyboard focus. Delivery is in-process after the tweet commits; the tweets table is the durable log. No outbox table.

## Sessions and CSRF

- Protected routes use the `requireSession` pre-handler. Missing, unknown, expired, and revoked sessions all get the same `401`.
- Cookie-authenticated mutations also use `requireCsrf`, which returns `403 FORBIDDEN` for a missing or wrong `X-CSRF-Token`.
- The CSRF token is `HMAC-SHA256(SESSION_SECRET, session token)` (signed double-submit). It is bound to one session, cannot be forged without the key, and is re-derivable, so `/me` returns the same token. Only its SHA-256 hash is stored. Rotating `SESSION_SECRET` invalidates outstanding CSRF tokens, but not sessions.

## Notifications (`/v1/notifications`)

All three routes belong to the session member (NOT-01) and answer `Cache-Control: no-store`; no session is `401`.

- `GET /v1/notifications?cursor=&limit=` → `notificationPageSchema`: newest first by `(created_at, id)`. Each item has `type` (`follow`, `like`, `reply`), the actor's public fields, `tweet` (`{ id, content }` of the liked tweet or the new reply; `null` for a follow), `createdAt` and `read`. Cursor and limit follow the timeline rules; the cursor is signed under a notifications label and bound to the member, so another member's or a tampered cursor is `400 MALFORMED_REQUEST`, as is any invalid parameter. Notifications from soft-deleted actors are hidden.
- `GET /v1/notifications/unread-count` → `{ "unreadCount": 3 }` from committed rows.
- `POST /v1/notifications/read` with `{ "ids": [uuid, …] }` (1–50) or `{ "all": true }` requires `X-CSRF-Token` (`403` without it) and answers `200 { "unreadCount": n }` after commit. Only the member's own notifications change: other members' ids are ignored, never revealed. `all` marks what arrived up to the request. An invalid body is `422`.

Notifications are created by follow, like and reply in the same transaction as the action, deduplicated by a unique key, and never for a member's own action. Rate limits per client address: list 120/minute, count 240/minute (the badge polls it), mark-read 60/minute.

## Rate-limit starting points

- Login/register: 5/minute per privacy-safe composite key, with measured tuning.
- Profile updates: 20/minute per client address. Profile reads and followers/following reads: 120/minute per client address. People search: 60/minute per client address.
- Tweet creation: 20/minute per client address; follow and unfollow: 60/minute per client address, counted separately; like and unlike: 60/minute per client address, counted separately.
- Reads: 120/minute/user/IP. Opening the live timeline stream: 30/minute per client address. Health checks are separately limited/allowlisted.

Return `Retry-After`. Limits are defense-in-depth, not business quotas, and must not rely solely on attacker-controlled IP headers. The client address honours `X-Forwarded-For` only from proxies listed in `TRUST_PROXY` (addresses, CIDRs, or `loopback`/`linklocal`/`uniquelocal`); production behind Caddy must set it, or every client shares the proxy's budget.

## Threaded replies (THR-01 / US-B04)

- `POST /v1/tweets/:id/replies` accepts the same strict `{ content }` (1–280 trimmed Unicode code points) and returns the same `201 { tweet }` card as posting a tweet. Only the session and URL choose author and parent. The parent may itself be a reply. Requires a live session and session CSRF token; uses the configured tweet write budget per client on this route. Invalid content, absent parent, unauthorized requests and rate limiting produce `422`, `404`, `401/403` and `429`, respectively.
- `GET /v1/tweets/:id/thread` is public. Returns `{ selected, items, nextCursor }`; selected and descendant cards have a nullable `parentTweetId`. Deleted authors are not shown. Guest liked state is false; an active session personalizes likes. Responses are not cached. Optional `limit` (default 20, max 30) and a signed `cursor` page all descendants, not just immediate children, in ascending creation time and UUID. Every child follows its parent. Cursors are valid only for that selected tweet; malformed, foreign or modified cursors return `400`. Read limit: 120/minute/client.
- `DELETE /v1/tweets/:id` still requires ownership of the target and confirmation in the UI. Its transaction removes the entire subtree, even other authors' replies, and their likes. A reply remains an authored tweet for feed eligibility and profile counts. The public page is `/tweets/:id`; opening a nested reply selects that branch.
