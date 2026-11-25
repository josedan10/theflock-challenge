import { and, eq, isNull, sql } from "drizzle-orm";

import {
  type Database,
  type DatabaseExecutor,
} from "../../../platform/database/client.js";
import { users } from "../../auth/infrastructure/auth.schema.js";
import { recordNotification } from "../../notifications/infrastructure/record-notification.js";
import {
  FollowTargetNotFoundError,
  SelfFollowError,
} from "../domain/errors.js";
import {
  decideFollowTarget,
  type FollowTargetDecision,
} from "../domain/follow-policy.js";

import { follows } from "./social.schema.js";

import type {
  FollowRelationship,
  FollowRepository,
  FollowWrite,
  UnfollowWrite,
} from "../application/ports.js";

const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Maps a failed follow write onto a domain error.
 *
 * The application rejects a self edge before insert. This still translates the
 * check constraint and a foreign key (a member disappearing mid-command) so a
 * database error never becomes a 500 or a leaked constraint name.
 */
export function interpretFollowPersistenceError(error: unknown): never {
  let checkViolation = false;
  let foreignKeyViolation = false;
  for (
    let current: unknown = error;
    current instanceof Error;
    current = current.cause
  ) {
    const code = (current as { code?: unknown }).code;
    if (code === CHECK_VIOLATION) {
      checkViolation = true;
    }
    if (code === FOREIGN_KEY_VIOLATION) {
      foreignKeyViolation = true;
    }
  }
  if (checkViolation) {
    throw new SelfFollowError();
  }
  if (foreignKeyViolation) {
    throw new FollowTargetNotFoundError();
  }
  throw error;
}

async function visibleTargetId(
  db: DatabaseExecutor,
  username: string,
): Promise<string | null> {
  const where = and(eq(users.username, username), isNull(users.deletedAt));
  if (where === undefined) {
    return null;
  }
  // Share lock: a concurrent account removal waits until this command commits,
  // so the edge and the count refer to a member who still exists.
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(where)
    .limit(1)
    .for("share");
  return row?.id ?? null;
}

function requireFollowableTarget(
  followerId: string,
  targetId: string | null,
): string {
  const decision: FollowTargetDecision = decideFollowTarget(
    followerId,
    targetId,
  );
  if (decision === "missing" || targetId === null) {
    throw new FollowTargetNotFoundError();
  }
  if (decision === "self") {
    throw new SelfFollowError();
  }
  return targetId;
}

async function followerCount(
  db: DatabaseExecutor,
  followingId: string,
): Promise<number> {
  const [row] = await db
    .select({
      followerCount: sql<number>`cast(count(*) as integer)`,
    })
    .from(follows)
    .where(eq(follows.followingId, followingId));
  return Number(row?.followerCount ?? 0);
}

/** Follow edges against PostgreSQL. The primary key owns uniqueness. */
export function createDrizzleFollowRepository(db: Database): FollowRepository {
  return {
    async follow(input: FollowWrite): Promise<FollowRelationship> {
      return db.transaction(async (tx) => {
        const targetId = requireFollowableTarget(
          input.followerId,
          await visibleTargetId(tx, input.username),
        );
        try {
          await tx
            .insert(follows)
            .values({
              createdAt: input.now,
              followerId: input.followerId,
              followingId: targetId,
            })
            .onConflictDoNothing({
              target: [follows.followerId, follows.followingId],
            });
        } catch (error: unknown) {
          interpretFollowPersistenceError(error);
        }
        // Same transaction; a re-follow after unfollowing does not repeat it.
        await recordNotification(
          tx,
          {
            actorId: input.followerId,
            recipientId: targetId,
            type: "follow",
          },
          input.now,
        );
        return {
          followerCount: await followerCount(tx, targetId),
          following: true,
          targetId,
        };
      });
    },

    async unfollow(input: UnfollowWrite): Promise<FollowRelationship> {
      return db.transaction(async (tx) => {
        const targetId = requireFollowableTarget(
          input.followerId,
          await visibleTargetId(tx, input.username),
        );
        try {
          await tx
            .delete(follows)
            .where(
              and(
                eq(follows.followerId, input.followerId),
                eq(follows.followingId, targetId),
              ),
            );
        } catch (error: unknown) {
          interpretFollowPersistenceError(error);
        }
        return {
          followerCount: await followerCount(tx, targetId),
          following: false,
          targetId,
        };
      });
    },
  };
}
