import { eq } from "drizzle-orm";

import {
  type Database,
  uniqueViolationConstraint,
} from "../../../platform/database/client.js";
import { type IdentityField, IdentityConflictError } from "../domain/errors.js";

import { users } from "./auth.schema.js";

import type {
  NewUser,
  StoredUser,
  UserRepository,
} from "../application/ports.js";

const conflictFieldByConstraint: Record<string, IdentityField> = {
  users_email_normalized_key: "email",
  users_username_key: "username",
};

/** Internal column projection shared by user and session reads. */
export const storedUserColumns = {
  id: users.id,
  email: users.email,
  emailNormalized: users.emailNormalized,
  username: users.username,
  displayName: users.displayName,
  bio: users.bio,
  avatarKey: users.avatarKey,
  passwordHash: users.passwordHash,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

/**
 * Relies on unique constraints rather than read-then-insert checks, so two
 * concurrent registrations for the same identifier cannot both succeed.
 */
export function createDrizzleUserRepository(db: Database): UserRepository {
  return {
    async create(user: NewUser): Promise<StoredUser> {
      try {
        const [created] = await db
          .insert(users)
          .values({
            id: user.id,
            email: user.email,
            emailNormalized: user.emailNormalized,
            username: user.username,
            displayName: user.displayName,
            passwordHash: user.passwordHash,
            createdAt: user.now,
            updatedAt: user.now,
          })
          .returning(storedUserColumns);

        if (created === undefined) {
          throw new Error("User insert returned no row");
        }
        return created;
      } catch (error: unknown) {
        const constraint = uniqueViolationConstraint(error);
        const field =
          constraint === null
            ? undefined
            : conflictFieldByConstraint[constraint];
        if (field !== undefined) {
          throw new IdentityConflictError(field);
        }
        throw error;
      }
    },

    async findByEmailNormalized(emailNormalized) {
      const [user] = await db
        .select(storedUserColumns)
        .from(users)
        .where(eq(users.emailNormalized, emailNormalized))
        .limit(1);
      return user ?? null;
    },

    async findByUsername(username) {
      const [user] = await db
        .select(storedUserColumns)
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      return user ?? null;
    },
  };
}
