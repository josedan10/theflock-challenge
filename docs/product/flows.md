# Product flows

## 1. First visit → registration → first tweet

1. Visitor lands on `/` and chooses **Create account**.
2. Form validates email, username, display name, and password locally using shared constraints.
3. API repeats validation, normalizes identifiers, hashes the password, and creates user + session transactionally.
4. Browser receives an HTTP-only session cookie and navigates to `/home`.
5. Empty timeline explains how to search/follow and offers tweet composition.
6. Member enters text; counter announces limits; submit creates the tweet. The composer shows a pending state and blocks a second submit. The tweet is stored immediately; undo does not delay the request.
7. The canonical tweet appears at the top of the home timeline with the entrance animation. The timeline does not show a separate “Posting your tweet…” block.
8. For 5 seconds that tweet shows a countdown line and **Undo**. Undo deletes it without the usual delete confirmation. After 5 seconds, Undo is gone and deletion uses the normal confirmation. Leaving the page ends the window; the tweet remains.

**Failure paths:** inline validation; duplicate identifier; rate limit with retry guidance; network retry that does not double-submit; a failed undo keeps the tweet and announces the error.

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
2. A signed-in member replies to the selected tweet or to any reply. The API validates the parent and derives the author from the session. The reply is stored immediately; undo does not delay the request.
3. For 5 seconds the new reply appears directly under the composer, above older replies, with a countdown line and **Undo**. Undo deletes it without the usual delete confirmation. After 5 seconds, Undo is gone, the reply joins the thread in its normal place, and later deletion uses the normal confirmation. Leaving the thread ends the window; the reply remains.
4. The thread displays replies in deterministic parent-before-child order and fetches bounded pages without duplicating entries.
5. A reply author may delete their own reply. Deleting any tweet removes all descendants, including replies by other users.
6. Show confirmation before deletion and reconcile thread views after success; errors preserve the visible content and offer retry. A failed undo keeps the reply and announces the error.

**Implementation caveat:** synchronous recursive deletion is an intentional local-challenge simplification. On a large thread it can cause expensive fan-out deletes and long transactions/locks; do not carry this design into a production-scale service without redesigning deletion.

## 9. Responsive navigation

- **Mobile `<640`:** single content column, compact header/bottom navigation, composer as page or sheet.
- **Tablet `640–1024`:** persistent primary navigation plus content column where space permits.
- **Desktop `>1024`:** constrained three-area shell; required content/actions never depend on hover.

## Planned feature flows

### Real-time (LIVE-01 / US-F01)

1. A signed-in member on `/home` opens `GET /v1/timeline/stream` (SSE) with the session cookie. No CSRF token: this is a read.
2. After a tweet by the member or someone they follow commits, the API writes an SSE event whose `id` is a signed cursor and whose `data` is `{ "tweetId" }`. Tweet text never goes on the stream.
3. The browser refetches `GET /v1/timeline` and merges new cards the same way as a post from this visit. At the top of the feed they prepend with the entrance animation. When the top of the feed is off screen, or the member is reading an older page, a **Show N new posts** banner stays in view and those cards wait there instead of jumping the list. Focus stays where it was.
4. EventSource reconnects with `Last-Event-ID`. The API replays at most 30 missed eligible ids, newest first, then resumes live events. The client drops ids it already has.
5. Disconnects, other authors' tweets, and a bad `Last-Event-ID` never expand what that member is allowed to see. Duplicate delivery is suppressed by tweet id.

### Images (IMG-01 / US-F02)

1. A signed-in member chooses one JPEG, PNG, or WebP. The composer checks the type and the 5 MiB limit before asking the API for anything.
2. `POST /v1/media/upload-intents` checks the session, CSRF token, and declared type and size, then returns a short-lived upload id and token. No file bytes are on this request.
3. The browser `PUT`s the bytes to that upload's content URL with the upload token. The API decodes and rewrites the image into the local object-storage adapter (a configured directory on a volume, not the container's own filesystem and not a cloud bucket). Tweet creation does not carry the file.
4. `POST /v1/tweets` references the verified upload. The image becomes readable only after that tweet commits, from `GET /v1/media/objects/:objectKey`, with a fixed image content type.
5. Deleting the tweet removes the metadata and the stored object. An upload that expires before it is attached, or that fails verification, is deleted and is never served.

**Failure paths:** a bad file or someone else's upload keeps the draft and announces the error. No tweet is stored.

### Notifications

1. Someone follows a member, likes their tweet, or replies to it. The notification is written in the same transaction as that action, so it exists exactly when the action commits. Repeating the action (re-like, re-follow, retry) never notifies twice, and a member is never notified of their own action.
2. The header's bell shows the unread count, refreshed periodically.
3. The Notifications page lists them newest first with Load more. Opening one marks it read; **Mark all as read** clears the rest. Read state is the member's own.
4. Deleting the liked tweet or the reply removes its notification.

**Failure paths:** a failed load offers retry; a failed mark-read keeps the item unread and says so.
