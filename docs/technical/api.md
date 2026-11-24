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

Follow and like responses return `{ state, count }`. Create tweet returns the complete card view model so the client does not invent timestamps/counts.

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

## Sessions and CSRF

- Protected routes use the `requireSession` pre-handler. Missing, unknown, expired, and revoked sessions all get the same `401`.
- Cookie-authenticated mutations also use `requireCsrf`, which returns `403 FORBIDDEN` for a missing or wrong `X-CSRF-Token`.
- The CSRF token is `HMAC-SHA256(SESSION_SECRET, session token)` (signed double-submit). It is bound to one session, cannot be forged without the key, and is re-derivable, so `/me` returns the same token. Only its SHA-256 hash is stored. Rotating `SESSION_SECRET` invalidates outstanding CSRF tokens, but not sessions.

## Rate-limit starting points

- Login/register: 5/minute per privacy-safe composite key, with measured tuning.
- Tweet creation: 20/minute/user; follows/likes: 60/minute/user.
- Reads: 120/minute/user/IP. Health checks are separately limited/allowlisted.

Return `Retry-After`. Limits are defense-in-depth, not business quotas, and must not rely solely on attacker-controlled IP headers. The client address honours `X-Forwarded-For` only from proxies listed in `TRUST_PROXY` (addresses, CIDRs, or `loopback`/`linklocal`/`uniquelocal`); production behind Caddy must set it, or every client shares the proxy's budget.
