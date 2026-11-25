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

| Method | Route                        |             Auth | Purpose                                       |
| ------ | ---------------------------- | ---------------: | --------------------------------------------- |
| POST   | `/auth/register`             |               no | Create user and session                       |
| POST   | `/auth/login`                |               no | Create/rotate session                         |
| POST   | `/auth/logout`               |              yes | Revoke current session                        |
| GET    | `/me`                        |              yes | Current user/session-safe profile             |
| PATCH  | `/me/profile`                |              yes | Edit display name/bio/avatar key when enabled |
| GET    | `/users/:username`           |         optional | Public profile                                |
| GET    | `/users/:username/tweets`    |         optional | Profile tweet page                            |
| GET    | `/users/:username/followers` |         optional | Cursor-paginated followers                    |
| GET    | `/users/:username/following` |         optional | Cursor-paginated following                    |
| PUT    | `/users/:username/follow`    |              yes | Idempotently follow                           |
| DELETE | `/users/:username/follow`    |              yes | Idempotently unfollow                         |
| GET    | `/users/search?q=`           |              yes | Search public user fields                     |
| POST   | `/tweets`                    |              yes | Create tweet                                  |
| DELETE | `/tweets/:id`                |              yes | Delete own tweet                              |
| PUT    | `/tweets/:id/like`           |              yes | Idempotently like                             |
| DELETE | `/tweets/:id/like`           |              yes | Idempotently unlike                           |
| GET    | `/timeline?cursor=&limit=`   |              yes | Home timeline                                 |
| GET    | `/health/live`               |               no | Process liveness only                         |
| GET    | `/health/ready`              | internal/limited | Dependency readiness, no secret details       |

Follow responses return `{ relationship: { following, followerCount } }`. Like responses will return `{ state, count }` in SOC-02. Create tweet returns the complete card view model so the client does not invent timestamps/counts.

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

## Home timeline (`GET /v1/timeline`)

Requires a live session; no CSRF token is needed for this read. Returns `200 { items: Tweet[], nextCursor: string | null }` with `Cache-Control: no-store`. Cards contain only the member's and currently followed authors' tweets, newest first (ties: descending tweet ID), with committed like counts and the session member's liked state.

Omit `cursor` on the first page. Pass the returned cursor unchanged for the next page; `null` means the end. A cursor is signed and bound to its viewer. The strict keyset survives deletion of its anchor and does not shift under newer inserts; following changes take effect on the next request. `limit` defaults to 20; positive decimal integers above 30 are clamped to 30. Invalid, unknown or repeated parameters and bad or cross-viewer cursors return `400 MALFORMED_REQUEST`. Missing, expired or revoked sessions return `401 UNAUTHENTICATED`. The read limit is 120 per minute per client address. Rotating `SESSION_SECRET` invalidates outstanding cursors; restart pagination without one.

## Sessions and CSRF

- Protected routes use the `requireSession` pre-handler. Missing, unknown, expired, and revoked sessions all get the same `401`.
- Cookie-authenticated mutations also use `requireCsrf`, which returns `403 FORBIDDEN` for a missing or wrong `X-CSRF-Token`.
- The CSRF token is `HMAC-SHA256(SESSION_SECRET, session token)` (signed double-submit). It is bound to one session, cannot be forged without the key, and is re-derivable, so `/me` returns the same token. Only its SHA-256 hash is stored. Rotating `SESSION_SECRET` invalidates outstanding CSRF tokens, but not sessions.

## Rate-limit starting points

- Login/register: 5/minute per privacy-safe composite key, with measured tuning.
- Profile updates: 20/minute per client address. Profile reads: 120/minute per client address.
- Tweet creation: 20/minute per client address; follow and unfollow: 60/minute per client address, counted separately. Likes stay at 60/minute when SOC-02 adds them.
- Reads: 120/minute/user/IP. Health checks are separately limited/allowlisted.

Return `Retry-After`. Limits are defense-in-depth, not business quotas, and must not rely solely on attacker-controlled IP headers. The client address honours `X-Forwarded-For` only from proxies listed in `TRUST_PROXY` (addresses, CIDRs, or `loopback`/`linklocal`/`uniquelocal`); production behind Caddy must set it, or every client shares the proxy's budget.
