import {
  normalizeUsername,
  STORED_USERNAME_PATTERN,
  USERNAME_MAX_LENGTH,
} from "@twitter-clone/contracts";

/**
 * Twice the stored maximum, so a 30-character username with surrounding
 * whitespace still resolves, while a padded or enormous path segment does not
 * get lowercased and looked up.
 */
const MAX_USERNAME_LOOKUP_LENGTH = USERNAME_MAX_LENGTH * 2;

/**
 * Canonical username for a public lookup.
 *
 * @returns The stored lowercase username, or `null` when the input cannot match
 * a row. Callers treat `null` as not found, not as a field error, so probes do
 * not get a separate signal for malformed usernames.
 */
export function canonicalPublicUsername(input: string): string | null {
  if (input.length > MAX_USERNAME_LOOKUP_LENGTH) {
    return null;
  }
  const username = normalizeUsername(input);
  return STORED_USERNAME_PATTERN.test(username) ? username : null;
}
