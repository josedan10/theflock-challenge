import { z } from "zod";

/** Username length bounds in ASCII characters (requirements rule 2). */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/**
 * Username format: starts with an ASCII letter, followed by ASCII letters,
 * digits, or `_`, 3–30 characters total. Case-insensitive; stored lowercase.
 */
export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,29}$/;

/**
 * Stored username: {@link USERNAME_PATTERN} after trim and lowercase.
 * Lookups and public responses use this form, never the caller's original casing.
 */
export const STORED_USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,29}$/;

/** Password length bounds in Unicode code points (requirements rule 3). */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Display name maximum in Unicode code points; matches `users.display_name`. */
export const DISPLAY_NAME_MAX_LENGTH = 80;

/** Bio maximum in Unicode code points; matches `users.bio`. */
export const BIO_MAX_LENGTH = 160;

/** RFC 5321 practical upper bound for an address. */
export const EMAIL_MAX_LENGTH = 254;

/** Counts user-perceived code points rather than UTF-16 units so emoji count once. */
export function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * Canonical comparison key for email uniqueness.
 *
 * Only trims and lowercases: provider-specific rewriting (dots, `+tags`) would
 * merge addresses that are distinct mailboxes for many providers.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Canonical stored and compared form of a username. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export const emailSchema = z
  .string()
  .trim()
  .max(EMAIL_MAX_LENGTH, "Must be at most 254 characters.")
  .pipe(z.email("Must be a valid email address."));

/**
 * Usernames that would collide with a static route under `/v1/users/`, so
 * their profile could never be read: `/v1/users/search` is people search.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set(["search"]);

export const usernameSchema = z
  .string()
  .trim()
  .regex(
    USERNAME_PATTERN,
    "Must be 3–30 characters: a letter followed by letters, digits, or underscores.",
  )
  .refine((value) => !RESERVED_USERNAMES.has(normalizeUsername(value)), {
    message: "That username is reserved. Choose another.",
  });

/**
 * Registration password policy. Never trimmed: whitespace is part of the secret.
 */
export const passwordSchema = z
  .string()
  .refine((value) => codePointLength(value) >= PASSWORD_MIN_LENGTH, {
    message: "Must be at least 10 characters.",
  })
  .refine((value) => codePointLength(value) <= PASSWORD_MAX_LENGTH, {
    message: "Must be at most 128 characters.",
  });

export const displayNameSchema = z
  .string()
  .trim()
  .refine((value) => codePointLength(value) >= 1, {
    message: "Must not be empty.",
  })
  .refine((value) => codePointLength(value) <= DISPLAY_NAME_MAX_LENGTH, {
    message: "Must be at most 80 characters.",
  });

/**
 * `POST /v1/auth/register` body. When `displayName` is omitted the API uses the
 * username as entered (AUTH-01).
 */
export const registerRequestSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
});

/** Validated registration input. */
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/**
 * `POST /v1/auth/login` body.
 *
 * Deliberately does not apply the registration password policy, so a failed
 * login never reveals policy details; wrong credentials yield a generic `401`.
 * The upper bound still caps hashing cost for oversized inputs.
 */
export const loginRequestSchema = z.object({
  email: z.string().trim().min(1).max(EMAIL_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/** Validated login input. */
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * The authenticated member as returned by register, login, and `GET /v1/me`.
 * Excludes email, password hash, and session material.
 */
export const sessionUserSchema = z.object({
  id: z.uuid(),
  username: z.string().regex(STORED_USERNAME_PATTERN),
  displayName: z.string().min(1),
  bio: z.string(),
  avatarUrl: z.url().nullable(),
  createdAt: z.iso.datetime({ offset: false }),
});

/** Session-safe view of the current member. */
export type SessionUser = z.infer<typeof sessionUserSchema>;

/**
 * Response body for successful register (`201`) and login (`200`).
 *
 * `csrfToken` must be sent as `X-CSRF-Token` on every cookie-authenticated
 * mutation. It is returned in the body because only its hash is stored, and
 * the session cookie itself is HTTP-only.
 */
export const authSessionResponseSchema = z.object({
  user: sessionUserSchema,
  csrfToken: z.string().min(32),
});

/** Authenticated session response body. */
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
