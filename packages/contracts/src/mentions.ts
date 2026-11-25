import { STORED_USERNAME_PATTERN } from "./auth";

/**
 * How many distinct existing members one tweet notifies (US-B05).
 * Further @handles stay in the text and are not notified, so a 280-character
 * post cannot fan out a notification per token.
 */
export const MENTION_LIMIT = 10;

/**
 * A valid @username that is not part of an email address. The character
 * before @ must be absent or not a username character, and the handle itself
 * matches the stored username shape.
 */
const MENTION_PATTERN =
  /(?:^|[^A-Za-z0-9_])@([A-Za-z][A-Za-z0-9_]{2,29})(?![A-Za-z0-9_])/g;

export type MentionSpan =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; username: string };

/** Usernames a tweet should notify, in order, lowercased and de-duplicated. */
export function mentionedUsernames(content: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const span of mentionSpans(content)) {
    if (span.kind !== "mention" || seen.has(span.username)) {
      continue;
    }
    seen.add(span.username);
    found.push(span.username);
    if (found.length === MENTION_LIMIT) {
      break;
    }
  }
  return found;
}

/** Splits plain tweet text into words and @mentions. The text is unchanged. */
export function mentionSpans(content: string): MentionSpan[] {
  const spans: MentionSpan[] = [];
  let cursor = 0;
  for (const match of content.matchAll(MENTION_PATTERN)) {
    const handle = match[1];
    if (
      handle === undefined ||
      !STORED_USERNAME_PATTERN.test(handle.toLowerCase())
    ) {
      continue;
    }
    const start = match.index + match[0].length - handle.length - 1;
    if (start > cursor) {
      spans.push({ kind: "text", text: content.slice(cursor, start) });
    }
    spans.push({
      kind: "mention",
      text: content.slice(start, start + handle.length + 1),
      username: handle.toLowerCase(),
    });
    cursor = start + handle.length + 1;
  }
  if (cursor < content.length) {
    spans.push({ kind: "text", text: content.slice(cursor) });
  }
  return spans;
}

/**
 * The @handle being typed at `caret`, when @ starts a mention and the
 * characters since then are still a partial username.
 */
export function mentionDraft(
  content: string,
  caret: number,
): { query: string; start: number } | null {
  const before = content.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0) {
    return null;
  }
  const previous = before[start - 1];
  if (previous !== undefined && /[A-Za-z0-9_]/.test(previous)) {
    return null;
  }
  const query = before.slice(start + 1);
  if (!/^[A-Za-z0-9_]{0,30}$/.test(query)) {
    return null;
  }
  return { query, start };
}
