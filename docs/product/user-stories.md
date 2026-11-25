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
- **AC-B01.5:** Given a successful create from the home composer, when the tweet joins the home timeline, then it uses the existing entrance animation and the timeline does not render a separate “Posting your tweet…” block. The response is not held back only to keep that block visible. Composer pending and failure behavior from AC-B01.4 stays.
- **AC-B01.6:** Given that tweet was just created, when fewer than 5 seconds have passed, then the tweet shows a countdown line and an Undo action. Undo deletes that tweet without the delete confirmation. At 5 seconds the countdown and Undo go away, and later removal uses AC-B02.3. Each new home post has its own window. Replies are unchanged.
- **AC-B01.7:** Given Undo fails, then the tweet remains and the error is announced. Leaving the timeline ends the window; the tweet stays posted. The countdown is understandable without motion and without announcing every remaining second.

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

### US-F01 Receive live timeline updates

**As a member, I want new eligible tweets to appear without refreshing so that I do not miss posts while I am on the home timeline.**

- **AC-F01.1:** Given a member has a live home-timeline stream, when an eligible tweet commits (the member's own or a followed author's), then the server sends an SSE event named `timeline.tweet` whose data is that tweet's id only.
- **AC-F01.2:** Given that event, the home UI loads authoritative cards and offers the tweet without moving keyboard focus. If the member has already asked for an older page, a banner is shown instead of prepending into the list they are reading.
- **AC-F01.3:** Given the stream reconnects with `Last-Event-ID`, the server emits missed eligible tweet ids (at most 30) and the client does not render the same tweet twice.
- **AC-F01.4:** An unauthenticated stream request is `401`. Tweets from authors the viewer does not follow (except the viewer) are not emitted. A tampered or other-viewer's `Last-Event-ID` does not leak another member's events.
- **AC-F01.5:** Opening the stream is rate limited per client address.

### US-F02 Attach one image to a tweet

**As a member, I want to attach one image to a tweet so that a post can include a picture.**

One image per tweet, including a reply. Text is still required (US-B01). JPEG, PNG, or WebP only. The file is at most 5 MiB and at most 4096 pixels on each edge. A description of up to 200 characters is optional; when present, that description is the image's text alternative. The browser sends the bytes to a short-lived upload URL backed by the local object-storage adapter. Creating the tweet only references the verified upload and does not carry the file. Unattached and rejected uploads are not publicly readable and are removed once they expire or fail verification. Deleting a tweet removes its image. The feature is off unless `UPLOADS_ENABLED` and `NEXT_PUBLIC_UPLOADS_ENABLED` are true.

- **AC-F02.1:** Given a signed-in member, when they request an upload for a JPEG, PNG, or WebP of 1 byte through 5 MiB, then the API returns a short-lived upload id and token. An unauthenticated request is `401`. A missing CSRF token is `403`. Any other type or size is `422` and stores nothing.
- **AC-F02.2:** Given that intent, when the same member uploads the bytes, then the API decodes the image, checks the type, size, and dimensions, rewrites it, and marks it verified. A mismatched, undecodable, animated, or oversized image is rejected and any stored bytes are removed. Another member cannot complete the upload. The bytes are not publicly readable before a tweet references them.
- **AC-F02.3:** Given a verified upload the member owns, when they create a tweet or reply with that upload, then the card includes one image. A description is optional. A second tweet cannot reuse the upload. An unverified, expired, foreign, or unknown upload is `422`, and no tweet is written. Image uploads stay unavailable while the feature is off.
- **AC-F02.4:** Given a tweet with an image, when it appears on the home timeline or a thread, then the image is shown. A description the member wrote is the text alternative; with no description the alternative is empty.
- **AC-F02.5:** Given the author deletes the tweet, when the delete commits, then the image metadata and stored object are removed. Expired uploads that were never attached are removed too.
- **US-F03 Notifications:** follow and like events create deduplicated recipient notifications; self-actions do not; read state is user-specific and paginated.

## Cross-cutting acceptance criteria

- Every error response follows the documented error envelope and includes a request ID.
- All write endpoints enforce authentication, authorization, validation, rate limits, and audit-safe structured logging.
- Dates use ISO 8601 UTC on the wire and locale-aware display in the browser.
- All list endpoints use opaque cursor pagination.
