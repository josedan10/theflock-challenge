import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "../../auth/infrastructure/auth.schema.js";
import { tweets } from "../../tweets/infrastructure/tweets.schema.js";

/** SHA-256 digests are stored as raw bytes; postgres.js maps `bytea` to `Buffer`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const timestamptz = (name: string) =>
  timestamp(name, { mode: "date", precision: 6, withTimezone: true });

const MIME = sql`'image/jpeg', 'image/png', 'image/webp'`;

/**
 * An upload before and after it is attached (US-F02). The plaintext token is
 * never stored. `object_key` is a server id, not a caller path. A row is
 * publicly readable only once `tweet_media` exists for it.
 */
export const mediaUploads = pgTable(
  "media_uploads",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectKey: uuid("object_key").notNull(),
    tokenHash: bytea("token_hash").notNull(),
    declaredMimeType: varchar("declared_mime_type", { length: 32 }).notNull(),
    declaredByteSize: integer("declared_byte_size").notNull(),
    mimeType: varchar("mime_type", { length: 32 }),
    byteSize: integer("byte_size"),
    width: integer("width"),
    height: integer("height"),
    status: varchar("status", { length: 16 }).notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    tweetId: uuid("tweet_id").references(() => tweets.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("media_uploads_object_key_key").on(table.objectKey),
    uniqueIndex("media_uploads_tweet_id_key").on(table.tweetId),
    index("media_uploads_expires_idx")
      .on(table.expiresAt)
      .where(sql`${table.status} in ('pending', 'verified', 'rejected')`),
    check(
      "media_uploads_token_hash_len",
      sql`octet_length(${table.tokenHash}) = 32`,
    ),
    check(
      "media_uploads_declared_mime_check",
      sql`${table.declaredMimeType} in (${MIME})`,
    ),
    check(
      "media_uploads_declared_size_check",
      sql`${table.declaredByteSize} between 1 and 5242880`,
    ),
    check(
      "media_uploads_status_check",
      sql`${table.status} in ('pending', 'verified', 'attached', 'rejected')`,
    ),
    check(
      "media_uploads_attached_tweet_check",
      sql`(${table.status} = 'attached') = (${table.tweetId} is not null)`,
    ),
    check(
      "media_uploads_verified_image_check",
      sql`(
        ${table.status} in ('pending', 'rejected')
        and ${table.mimeType} is null
        and ${table.byteSize} is null
        and ${table.width} is null
        and ${table.height} is null
      ) or (
        ${table.status} in ('verified', 'attached')
        and ${table.mimeType} in (${MIME})
        and ${table.byteSize} between 1 and 5242880
        and ${table.width} between 1 and 4096
        and ${table.height} between 1 and 4096
      )`,
    ),
  ],
);

/**
 * The one image attached to a tweet (database model). Deleting the tweet
 * removes this row. Object bytes are deleted by the application after commit.
 */
export const tweetMedia = pgTable(
  "tweet_media",
  {
    tweetId: uuid("tweet_id")
      .primaryKey()
      .references(() => tweets.id, { onDelete: "cascade" }),
    objectKey: uuid("object_key").notNull(),
    mimeType: varchar("mime_type", { length: 32 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    altText: text("alt_text").notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("tweet_media_object_key_key").on(table.objectKey),
    check("tweet_media_status_check", sql`${table.status} = 'attached'`),
    check("tweet_media_mime_check", sql`${table.mimeType} in (${MIME})`),
    check(
      "tweet_media_size_check",
      sql`${table.byteSize} between 1 and 5242880`,
    ),
    check(
      "tweet_media_dimensions_check",
      sql`${table.width} between 1 and 4096 and ${table.height} between 1 and 4096`,
    ),
    check(
      "tweet_media_alt_check",
      sql`char_length(${table.altText}) <= 200 and ${table.altText} = btrim(${table.altText})`,
    ),
  ],
);
