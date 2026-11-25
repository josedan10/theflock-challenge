# User stories and acceptance criteria

The scenarios use Given/When/Then language so they can become executable API or browser tests. IDs are stable and should be referenced by tests and pull requests.

## Epic A — Authentication and profiles

### US-A01 Register

**As a visitor, I want to register so that I can participate.**

- **AC-A01.1:** Given valid unique email/username and a conforming password, when registration succeeds, then the account and a new authenticated session exist and no password is returned.
- **AC-A01.2:** Duplicate email or username (regardless of case) returns `409` with a safe field-level error.
- **AC-A01.3:** Invalid email, username, or password returns `422`; no user or session is written.
- **AC-A01.4:** Password is stored only as an Argon2id hash.
- **AC-A01.5:** Repeated registration attempts are rate limited without revealing whether unrelated accounts exist.

### US-A02 Login and logout

**As a member, I want a secure, revocable session.**

- **AC-A02.1:** Valid credentials create/rotate the session and set an HTTP-only cookie.
- **AC-A02.2:** Wrong email or password returns the same generic `401` response.
- **AC-A02.3:** Logout revokes the current session, clears the cookie, and is idempotent.
- **AC-A02.4:** Expired/revoked sessions cannot access protected operations.
- **AC-A02.5:** A CSRF-missing mutation using cookie auth is rejected.

### US-A03 View a profile

- **AC-A03.1:** Profile shows placeholder/avatar, display name, `@username`, bio, tweet/follower/following counts.
- **AC-A03.2:** Unknown username returns a real `404` state, not a blank profile.
- **AC-A03.3:** Bio is escaped and cannot inject markup/script.

## Epic B — Tweets and timeline

### US-B01 Create a tweet

- **AC-B01.1:** An authenticated member can publish non-whitespace text from 1 through 280 characters.
- **AC-B01.2:** Empty, whitespace-only, or over-limit content returns `422` and is not persisted.
- **AC-B01.3:** An unauthenticated request returns `401`.
- **AC-B01.4:** The UI shows remaining characters, prevents a second submit while pending, and exposes success/failure accessibly.

### US-B02 Delete a tweet

- **AC-B02.1:** The author can delete their tweet; it no longer appears in timelines/profile and dependent likes are removed.
- **AC-B02.2:** A different authenticated user receives `403`; an unknown/already-deleted tweet returns `404` (repeat delete may be treated as successful only if the API contract is explicitly changed).
- **AC-B02.3:** The UI asks for confirmation and restores control after failure.

### US-B03 Read home timeline

- **AC-B03.1:** The feed includes tweets from followed users and the current member only.
- **AC-B03.2:** Items order by `created_at DESC, id DESC` and include author, content, timestamp, like count, and viewer-liked state.
- **AC-B03.3:** A next cursor retrieves older unique items; concurrent inserts do not shift/duplicate the next page.
- **AC-B03.4:** Cursor tampering returns `400`; page size defaults to 20 and caps at 30.
- **AC-B03.5:** Loading, empty, error, and end-of-feed states are distinguishable and accessible.

### US-B04 Create and read threaded replies

- **AC-B04.1:** An authenticated member can reply with 1–280 Unicode characters to any existing, publicly visible tweet, including another reply. The server sets the author from the session.
- **AC-B04.2:** Replies are publicly readable by members and logged-out visitors. Each reply belongs to exactly one parent; arbitrary nesting is supported.
- **AC-B04.3:** A thread view shows the selected tweet and its descendant replies in deterministic parent-before-child order, with bounded pagination and author context.
- **AC-B04.4:** Only a reply's author can delete that reply. Deleting a tweet removes its full descendant subtree, regardless of reply authorship; deletion is atomic from the API's perspective.
- **AC-B04.5:** Thread navigation, reply composition, loading, empty, error, and pagination states are keyboard accessible and clearly announced.
- **AC-B04.6:** Invalid content, missing parent, unauthenticated writes, and rate limits return safe errors and do not create replies.

## Epic C — Social graph

### US-C01 Follow/unfollow

- **AC-C01.1:** A member can follow another existing member once; counts update after commit.
- **AC-C01.2:** Self-follow returns `422`; duplicate follow/unfollow requests are idempotent.
- **AC-C01.3:** Following someone makes their tweets eligible for subsequently fetched timeline pages.
- **AC-C01.4:** Optimistic UI rolls back when the API rejects the action.

### US-C02 Like/unlike

- **AC-C02.1:** Like creates at most one relation for `(user,tweet)` and unlike removes it idempotently.
- **AC-C02.2:** Like count and viewer-liked state update without full reload and roll back on error.
- **AC-C02.3:** Deleted/unknown tweets return `404`; unauthenticated requests return `401`.
- **AC-C02.4:** Concurrent likes do not lose updates or produce a negative/inaccurate count.

### US-C03 Followers/following lists

- **AC-C03.1:** Profile lists are cursor-paginated, return unique users, and show relationship state relative to the viewer.
- **AC-C03.2:** Empty and end-of-list states are clear.

## Epic D — Search

### US-D01 Search for people

- **AC-D01.1:** A query of 2–50 characters matches username or display name case-insensitively.
- **AC-D01.2:** Exact username matches rank before prefix and substring matches; ties are deterministic.
- **AC-D01.3:** Results are capped/paginated, escaped, and exclude secrets such as email.
- **AC-D01.4:** Too-short input is handled client-side and server-side; special SQL wildcard characters cannot alter query meaning.

## Epic E — Responsive and accessible UI

### US-E01 Use on any supported viewport

- **AC-E01.1:** At 320–639 px the primary navigation is touch-friendly and content does not scroll horizontally.
- **AC-E01.2:** At 640–1024 px layout uses available space without hiding required actions.
- **AC-E01.3:** Above 1024 px timeline retains readable line length and secondary navigation may be shown.
- **AC-E01.4:** Required flows are keyboard-completable, screen-reader-labelled, and pass automated axe checks with no serious/critical issue.

## Planned feature epics

- **US-F01 Real time:** new eligible tweets are announced without stealing focus; reconnection performs a cursor catch-up and avoids duplicates.
- **US-F02 Image:** one JPEG/PNG/WebP, validated by decoded type/size/dimensions, uploads directly to object storage; inaccessible partial uploads are cleaned up.
- **US-F03 Notifications:** follow and like events create deduplicated recipient notifications; self-actions do not; read state is user-specific and paginated.

## Cross-cutting acceptance criteria

- Every error response follows the documented error envelope and includes a request ID.
- All write endpoints enforce authentication, authorization, validation, rate limits, and audit-safe structured logging.
- Dates use ISO 8601 UTC on the wire and locale-aware display in the browser.
- All list endpoints use opaque cursor pagination.
