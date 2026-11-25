import { and, eq, gt, inArray, lt } from "drizzle-orm";

import { mediaUploads, tweetMedia } from "./media.schema.js";

import type {
  DatabaseExecutor,
  Transaction,
} from "../../../platform/database/client.js";
import type {
  ClaimedMedia,
  MediaRepository,
  MediaUpload,
  NewMediaUpload,
  VerifiedMedia,
} from "../application/ports.js";
import type { ImageMimeType } from "../domain/image-policy.js";

function asMime(value: string): ImageMimeType {
  if (
    value !== "image/jpeg" &&
    value !== "image/png" &&
    value !== "image/webp"
  ) {
    throw new Error("Stored image type is not an accepted type.");
  }
  return value;
}

function toUpload(row: typeof mediaUploads.$inferSelect): MediaUpload {
  return {
    byteSize: row.byteSize,
    declaredByteSize: row.declaredByteSize,
    declaredMimeType: asMime(row.declaredMimeType),
    expiresAt: row.expiresAt,
    height: row.height,
    id: row.id,
    mimeType: row.mimeType === null ? null : asMime(row.mimeType),
    objectKey: row.objectKey,
    ownerId: row.ownerId,
    status: row.status as MediaUpload["status"],
    tokenHash: row.tokenHash,
    width: row.width,
  };
}

export function createMediaRepository(db: DatabaseExecutor): MediaRepository {
  return {
    async find(id) {
      const [row] = await db
        .select()
        .from(mediaUploads)
        .where(eq(mediaUploads.id, id));
      return row === undefined ? null : toUpload(row);
    },
    async findAttached(objectKey) {
      const [row] = await db
        .select({ mimeType: tweetMedia.mimeType })
        .from(tweetMedia)
        .where(
          and(
            eq(tweetMedia.objectKey, objectKey),
            eq(tweetMedia.status, "attached"),
          ),
        );
      return row === undefined ? null : { mimeType: asMime(row.mimeType) };
    },
    async insert(upload: NewMediaUpload) {
      await db.insert(mediaUploads).values({
        createdAt: upload.now,
        declaredByteSize: upload.declaredByteSize,
        declaredMimeType: upload.declaredMimeType,
        expiresAt: upload.expiresAt,
        id: upload.id,
        objectKey: upload.objectKey,
        ownerId: upload.ownerId,
        status: "pending",
        tokenHash: upload.tokenHash,
      });
    },
    async markRejected(id) {
      await db
        .update(mediaUploads)
        .set({ status: "rejected" })
        .where(
          and(eq(mediaUploads.id, id), eq(mediaUploads.status, "pending")),
        );
    },
    async markVerified(id, image: VerifiedMedia, now) {
      const [row] = await db
        .update(mediaUploads)
        .set({
          byteSize: image.byteSize,
          height: image.height,
          mimeType: image.mimeType,
          status: "verified",
          width: image.width,
        })
        .where(
          and(
            eq(mediaUploads.id, id),
            eq(mediaUploads.status, "pending"),
            gt(mediaUploads.expiresAt, now),
          ),
        )
        .returning({ id: mediaUploads.id });
      return row !== undefined;
    },
    async reapExpired(now) {
      const rows = await db
        .delete(mediaUploads)
        .where(
          and(
            lt(mediaUploads.expiresAt, now),
            inArray(mediaUploads.status, ["pending", "verified", "rejected"]),
          ),
        )
        .returning({
          objectKey: mediaUploads.objectKey,
          status: mediaUploads.status,
        });
      return rows
        .filter((row) => row.status === "verified")
        .map((row) => row.objectKey);
    },
  };
}

/**
 * Attaches a verified upload to a tweet that was inserted in this same
 * transaction. Returns null when the upload is missing, foreign, expired, or
 * already used, and the caller rolls the tweet back (AC-F02.3).
 */
export async function claimVerifiedUpload(
  tx: Transaction,
  input: {
    alt: string;
    now: Date;
    ownerId: string;
    tweetId: string;
    uploadId: string;
  },
): Promise<ClaimedMedia | null> {
  const [claimed] = await tx
    .update(mediaUploads)
    .set({ status: "attached", tweetId: input.tweetId })
    .where(
      and(
        eq(mediaUploads.id, input.uploadId),
        eq(mediaUploads.ownerId, input.ownerId),
        eq(mediaUploads.status, "verified"),
        gt(mediaUploads.expiresAt, input.now),
      ),
    )
    .returning();
  if (
    claimed === undefined ||
    claimed.mimeType === null ||
    claimed.byteSize === null ||
    claimed.width === null ||
    claimed.height === null
  ) {
    return null;
  }
  await tx.insert(tweetMedia).values({
    altText: input.alt,
    byteSize: claimed.byteSize,
    createdAt: input.now,
    height: claimed.height,
    mimeType: claimed.mimeType,
    objectKey: claimed.objectKey,
    status: "attached",
    tweetId: input.tweetId,
    width: claimed.width,
  });
  return {
    alt: input.alt,
    byteSize: claimed.byteSize,
    height: claimed.height,
    mimeType: asMime(claimed.mimeType),
    objectKey: claimed.objectKey,
    width: claimed.width,
  };
}
