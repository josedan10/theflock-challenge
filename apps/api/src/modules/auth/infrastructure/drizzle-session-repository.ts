import { and, eq, gt, isNull } from "drizzle-orm";

import { sessions, users } from "./auth.schema.js";
import { storedUserColumns } from "./drizzle-user-repository.js";

import type { DatabaseExecutor } from "../../../platform/database/client.js";
import type { SessionRepository, StoredSession } from "../application/ports.js";

const storedSessionColumns = {
  id: sessions.id,
  userId: sessions.userId,
  csrfSecretHash: sessions.csrfSecretHash,
  createdAt: sessions.createdAt,
  lastSeenAt: sessions.lastSeenAt,
  expiresAt: sessions.expiresAt,
  revokedAt: sessions.revokedAt,
};

export function createDrizzleSessionRepository(
  db: DatabaseExecutor,
): SessionRepository {
  return {
    async create(session): Promise<StoredSession> {
      const [created] = await db
        .insert(sessions)
        .values({
          id: session.id,
          userId: session.userId,
          tokenHash: session.tokenHash,
          csrfSecretHash: session.csrfSecretHash,
          createdAt: session.now,
          lastSeenAt: session.now,
          expiresAt: session.expiresAt,
        })
        .returning(storedSessionColumns);

      if (created === undefined) {
        throw new Error("Session insert returned no row");
      }
      return created;
    },

    async findActiveByTokenHash(tokenHash, now) {
      // Expiry, revocation, and account deletion are all checked in one
      // indexed lookup so no caller can forget one of them (AC-A02.4).
      const [row] = await db
        .select({ session: storedSessionColumns, user: storedUserColumns })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async revoke(sessionId, now) {
      const revoked = await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      return revoked.length > 0;
    },
  };
}
