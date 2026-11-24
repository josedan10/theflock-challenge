import { z } from "zod";

import {
  BIO_MAX_LENGTH,
  codePointLength,
  displayNameSchema,
  STORED_USERNAME_PATTERN,
} from "./auth";

/**
 * Profile bio, stored and returned as plain text.
 *
 * Markup is not interpreted or stripped. Clients must escape it when rendering
 * (AC-A03.3). Empty is allowed; surrounding whitespace is removed.
 */
export const bioSchema = z
  .string()
  .trim()
  .refine((value) => !value.includes("\u0000"), {
    message: "Must not contain a null character.",
  })
  .refine((value) => codePointLength(value) <= BIO_MAX_LENGTH, {
    message: "Must be at most 160 characters.",
  });

/**
 * `PATCH /v1/me/profile` body (PROFILE-02).
 *
 * Only the member's display name and bio can change, and at least one of them
 * is required. Identity fields and `avatarKey` are intentionally absent: a
 * storage key must not be assignable until an upload can prove the caller owns
 * the object. Unknown keys are rejected.
 */
export const updateProfileRequestSchema = z
  .strictObject({
    bio: bioSchema.optional(),
    displayName: displayNameSchema.optional(),
  })
  .refine(
    (value) => value.displayName !== undefined || value.bio !== undefined,
    { message: "Provide a display name or a bio." },
  );

/** Validated profile update. Omitted fields are left unchanged. */
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

/**
 * Public profile document (PROFILE-01, US-A03).
 *
 * `avatarUrl` is `null` until image upload exists; clients render a placeholder.
 * Counts agree with committed rows. Email, password material, and storage keys
 * are never part of this document.
 */
export const publicProfileSchema = z.object({
  avatarUrl: z.url().nullable(),
  bio: z.string(),
  createdAt: z.iso.datetime({ offset: false }),
  displayName: z.string().min(1),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
  id: z.uuid(),
  tweetCount: z.number().int().nonnegative(),
  username: z.string().regex(STORED_USERNAME_PATTERN),
});

/** Public profile returned by profile reads and by a member's own update. */
export type PublicProfile = z.infer<typeof publicProfileSchema>;

/** Response body for `GET /v1/users/:username` and `PATCH /v1/me/profile`. */
export const publicProfileResponseSchema = z.object({
  profile: publicProfileSchema,
});

/** Parsed public-profile response. */
export type PublicProfileResponse = z.infer<typeof publicProfileResponseSchema>;
