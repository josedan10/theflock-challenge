const units = [
  { size: 1_000_000_000, suffix: "B" },
  { size: 1_000_000, suffix: "M" },
  { size: 1_000, suffix: "k" },
] as const;

/**
 * Short form of a profile count: 999, 1k, 1.1k, 12.3k, 1M, 2.3M, 1B.
 *
 * One decimal at most, rounded down, so a count never looks larger than it
 * is and 999,999 stays "999.9k" instead of "1000k". A trailing ".0" is
 * dropped. Integer math avoids floating-point drift.
 */
export function formatCount(value: number): string {
  for (const { size, suffix } of units) {
    if (value >= size) {
      const tenths = Math.floor((value * 10) / size);
      const whole = Math.floor(tenths / 10);
      const decimal = tenths % 10;
      return `${whole}${decimal === 0 ? "" : `.${decimal}`}${suffix}`;
    }
  }
  return String(value);
}

const exact = new Intl.NumberFormat("en-US");

/** Full count with grouping, for the hover title next to a short form. */
export function formatExactCount(value: number): string {
  return exact.format(value);
}
