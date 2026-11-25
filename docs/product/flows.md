# Product flows

## 1. First visit → registration → first tweet

1. Visitor lands on `/` and chooses **Create account**.
2. Form validates email, username, display name, and password locally using shared constraints.
3. API repeats validation, normalizes identifiers, hashes the password, and creates user + session transactionally.
4. Browser receives an HTTP-only session cookie and navigates to `/home`.
5. Empty timeline explains how to search/follow and offers tweet composition.
6. Member enters text; counter announces limits; submit creates the tweet.
7. Tweet appears at the top using the canonical API response.

**Failure paths:** inline validation; duplicate identifier; rate limit with retry guidance; network retry that does not double-submit.

## 2. Login → session validation → logout

1. Visitor enters credentials at `/login`.
2. API uses a generic failure response, rate limits by safe combined keys, and rotates the session on success.
3. Protected routes resolve `/v1/me` before rendering private actions.
4. Logout sends a CSRF-protected request, revokes the server session, clears the cookie, and returns to the public landing page.

## 3. Follow → timeline

1. Member searches by username/display name.
2. Results show public profile data and current follow state.
3. Member follows a result; UI optimistically changes the button with a disabled pending state.
4. API inserts the unique follow edge; the canonical response supplies counts/state.
5. Next home-timeline fetch includes that person's eligible tweets. Unfollow removes future eligibility but does not mutate cached historical pages silently; refresh reconciles.

## 4. Infinite timeline

1. Initial request omits a cursor and receives `items` plus `nextCursor`.
2. An IntersectionObserver sentinel requests the next page once; a manual **Load more** control remains available.
3. The client deduplicates by tweet ID, preserves scroll position, and stops on a null cursor.
4. Retry affects only the failed page. Newer posts are offered via a non-disruptive banner rather than prepended while reading.

## 5. Like/unlike

1. Member activates the like control.
2. UI optimistically toggles state/count and disables rapid duplicate action for that tweet.
3. API upserts/deletes the unique like edge and returns canonical state/count.
4. Client reconciles; on failure it rolls back and announces the error.

## 6. Delete own tweet

1. Author opens tweet actions and selects delete.
2. Accessible confirmation names the irreversible action.
3. API checks session and ownership, deletes transactionally, and returns `204`.
4. Client removes the item from all query caches. Failure retains the tweet and offers retry.

## 7. Profile followers/following

1. Any viewer, including a logged-out visitor, opens `/u/:username`. The API reads `GET /v1/users/:username`.
2. Counts link to paginated followers/following routes.
3. List entries show identity and viewer relationship controls.
4. Follow changes reconcile both the row and profile counts.

## 8. Threaded replies

1. Any visitor opens a tweet's thread; the parent and nested descendants are public.
2. A signed-in member replies to the selected tweet or to any reply. The API validates the parent and derives the author from the session.
3. The thread displays replies in deterministic parent-before-child order and fetches bounded pages without duplicating entries.
4. A reply author may delete their own reply. Deleting any tweet removes all descendants, including replies by other users.
5. Show confirmation before deletion and reconcile thread views after success; errors preserve the visible content and offer retry.

**Implementation caveat:** synchronous recursive deletion is an intentional local-challenge simplification. On a large thread it can cause expensive fan-out deletes and long transactions/locks; do not carry this design into a production-scale service without redesigning deletion.

## 9. Responsive navigation

- **Mobile `<640`:** single content column, compact header/bottom navigation, composer as page or sheet.
- **Tablet `640–1024`:** persistent primary navigation plus content column where space permits.
- **Desktop `>1024`:** constrained three-area shell; required content/actions never depend on hover.

## Planned feature flows

### Real-time

Use SSE before WebSockets because updates are server-to-client. Events contain IDs only; clients refetch authoritative data. Reconnect uses `Last-Event-ID`/cursor catch-up.

### Images

API grants a short-lived upload intent; browser uploads to S3-compatible storage; tweet creation references a verified object. Do not proxy large files through the API.

### Notifications

Domain events written in the same transaction (outbox pattern) produce deduplicated notifications. v1 supports follow and like, excludes self-notifications, and marks items read explicitly.
