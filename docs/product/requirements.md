# Product requirements

## 1. Product definition

The application (working title: **Twitter Clone**) is a deliberately small Twitter-like product in which people create accounts, publish short text posts, build a follow graph, react with likes, discover users, and read a chronological timeline. “The Flock” refers only to the company proposing the challenge and must not be used as the product name.

### Goals

- Deliver the complete required feature set with excellent mobile usability.
- Make security, correctness, observability, and automated tests first-class concerns.
- Keep the initial system inexpensive and operable by a small team.
- Leave clear extension points for real-time updates, images, and notifications.

### Non-goals for v1

- Algorithmic ranking, retweets/quotes, hashtags, DMs, polls, moderation tooling, account recovery, OAuth/social login, verified accounts, private accounts, or multiple tweet media items.
- Exactly matching Twitter/X branding or visual design.
- Multi-region/high-availability infrastructure.

## 2. Personas

- **Visitor:** can register, log in, and view public profiles/tweets if the route policy permits.
- **Member:** can post/delete own tweets, follow/unfollow, like/unlike, search, and view lists/timelines.
- **Operator:** deploys, monitors, backs up, restores, and responds to incidents. There is no in-product admin role in v1.

## 3. Functional requirements

| ID         | Requirement                                                                                                        | Priority |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| AUTH-01    | Register with email, password, unique username, and optional display name                                          | Must     |
| AUTH-02    | Log in and log out using a revocable server-side session                                                           | Must     |
| AUTH-03    | Protect all write actions and private/member routes                                                                | Must     |
| PROFILE-01 | Show username, display name, bio, avatar placeholder, follower/following counts                                    | Must     |
| PROFILE-02 | Edit own display name, bio, and supported profile fields                                                           | Should   |
| TWEET-01   | Create a plain-text tweet of 1–280 Unicode characters                                                              | Must     |
| TWEET-02   | Delete only one's own tweet                                                                                        | Must     |
| TWEET-03   | After a home-timeline post, show the tweet with its entrance animation and a 5-second undo; no posting placeholder | Should   |
| THREAD-01  | Create and read publicly visible, recursively nested replies; deleting a root removes its entire reply subtree     | Must     |
| FEED-01    | Show tweets by followed users and the member, newest first                                                         | Must     |
| FEED-02    | Paginate timeline with stable cursor-based pagination                                                              | Must     |
| SOCIAL-01  | Follow/unfollow another user, never oneself                                                                        | Must     |
| SOCIAL-02  | Like/unlike a tweet idempotently and display the count                                                             | Must     |
| SOCIAL-03  | List followers and following with pagination                                                                       | Must     |
| SEARCH-01  | Search users by case-insensitive username or display name                                                          | Must     |
| UI-01      | Mobile-first responsive interface at `<640`, `640–1024`, and `>1024` px                                            | Must     |
| RT-01      | Stream new timeline items without refresh                                                                          | Could    |
| MEDIA-01   | Attach one validated image to a tweet                                                                              | Could    |
| NOTIFY-01  | Notify recipients of a new follow or like on their tweet                                                           | Could    |

The detailed test conditions live in [user-stories.md](user-stories.md).

### Thread deletion tradeoff

For this local challenge, deleting a tweet synchronously deletes that tweet and every descendant reply, including replies authored by other members. This intentionally simple behavior differs from what X documents. A large reply tree can make a delete expensive, hold locks for a long time, and amplify database work. This is not a production recommendation; production should evaluate bounded/asynchronous deletion, tombstones, and retention semantics.

## 4. Business rules

1. Emails and usernames are unique case-insensitively; usernames are stored normalized in lowercase.
2. Username format: 3–30 ASCII characters, starting with a letter, followed by letters, digits, or `_`.
3. Passwords are 10–128 characters and are hashed with Argon2id. Password values are never logged.
4. Tweet length is measured consistently by the shared validation package and database guard; whitespace-only tweets are invalid.
5. Timeline order is deterministic: `created_at DESC, id DESC`.
6. Like and follow operations are set-like: duplicate operations do not create duplicate rows.
7. Deleting a tweet removes its likes and any dependent optional records transactionally.
8. Counts returned by the API must agree with committed database state.
9. A member's own tweets appear in their home timeline without requiring self-follow.
10. v1 accounts and tweets are public. This must be stated in the UI.

## 5. Non-functional requirements

### Quality

- TypeScript strict mode; no unchecked `any` in product code.
- Coverage gates: 90% lines/functions/statements and 85% branches globally, 100% branch coverage for authorization/domain-policy modules. Mutation testing targets critical rules.
- All required acceptance criteria have at least one automated test at the correct layer.

### Performance targets (initial SLOs)

- API p95 under 300 ms for reads and 500 ms for writes at 25 concurrent users, excluding cold starts and external storage.
- Initial mobile page usable within 3 seconds on a mid-tier device over simulated Fast 3G.
- Timeline endpoint returns at most 30 items and never performs per-row (N+1) queries.

### Reliability and operations

- 99.5% monthly availability target for the MVP; no contractual SLA.
- `/health/live` and `/health/ready` endpoints; structured JSON logs with request IDs.
- Daily encrypted database backup, 7-day retention, monthly restore exercise.
- Recovery targets: RPO 24 hours initially; RTO 2 hours.

### Security and privacy

- HTTP-only, Secure production cookies; exact-origin CORS; CSRF protection for cookie-authenticated mutations; rate limits on auth and write endpoints.
- Generic authentication errors, constant-time secret comparisons where applicable, and session rotation on login.
- Secrets only in local ignored `.env` files or deployment secret stores; `.env.example` contains placeholders.
- Dependency, container, secret, and static analysis in CI.
- Collect only data needed for this product. Define account deletion/export before public launch.

### Accessibility and responsive design

- WCAG 2.2 AA target: semantic landmarks, keyboard operation, visible focus, labels, contrast, reduced-motion support.
- No horizontal scrolling at 320 px. Interactive targets aim for at least 44×44 CSS pixels.
- Test representative widths: 375, 768, and 1440 px.

## 6. Release criteria

A required feature is releasable only when its acceptance tests pass, accessibility checks have no serious/critical findings, migrations are reversible or have a documented forward-fix, observability is present, documentation is updated, and the staging smoke test passes.
