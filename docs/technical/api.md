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

## Rate-limit starting points

- Login/register: 5/minute per privacy-safe composite key, with measured tuning.
- Tweet creation: 20/minute/user; follows/likes: 60/minute/user.
- Reads: 120/minute/user/IP. Health checks are separately limited/allowlisted.

Return `Retry-After`. Limits are defense-in-depth, not business quotas, and must not rely solely on attacker-controlled IP headers.
