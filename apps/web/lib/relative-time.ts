const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const sameYear = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});
const otherYear = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Twitter-style compact time for a tweet row: "now", "5m", "3h", then the
 * date ("Nov 25", or "Nov 25, 2025" in another year). Future times (clock
 * skew) read "now". The exact time stays in the `<time>` element's title.
 */
export function compactTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < MINUTE) {
    return "now";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h`;
  }
  return then.getFullYear() === now.getFullYear()
    ? sameYear.format(then)
    : otherYear.format(then);
}
