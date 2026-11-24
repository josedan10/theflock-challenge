# Workflow diagram catalog

Interactive diagrams are generated with Archify from the versioned JSON specifications in `specs/`. Generated HTML and visual-check assets are intentionally ignored to keep commits small; regenerate them locally. Each delivered HTML file supports theme switching, search, pan/zoom, and SVG/PNG export.

| Workflow                         | Specification                                | Interactive diagram           |
| -------------------------------- | -------------------------------------------- | ----------------------------- |
| Authentication and sessions      | `specs/authentication.workflow.json`         | `authentication.html`         |
| Tweet publishing/deletion        | `specs/tweet-publishing.workflow.json`       | `tweet-publishing.html`       |
| Home timeline/pagination         | `specs/timeline.workflow.json`               | `timeline.html`               |
| Follow/unfollow                  | `specs/following.workflow.json`              | `following.html`              |
| Like/unlike                      | `specs/likes.workflow.json`                  | `likes.html`                  |
| User search                      | `specs/user-search.workflow.json`            | `user-search.html`            |
| Profiles and relationship lists  | `specs/profile-lists.workflow.json`          | `profile-lists.html`          |
| Optional real-time/notifications | `specs/realtime-notifications.workflow.json` | `realtime-notifications.html` |
| Optional media upload            | `specs/media-upload.workflow.json`           | `media-upload.html`           |
| CI and delivery                  | `specs/delivery.workflow.json`               | `delivery.html`               |

## Regenerate one diagram

From the Archify skill directory:

```bash
node bin/archify.mjs validate workflow /absolute/path/to/spec.workflow.json --quality showcase --json
node bin/archify.mjs deliver workflow /absolute/path/to/spec.workflow.json /absolute/path/to/output.html --quality showcase --json
node bin/archify.mjs visual-check /absolute/path/to/output.html --json
```

Never edit delivered HTML directly. Change the JSON specification, validate it, and deliver again.
