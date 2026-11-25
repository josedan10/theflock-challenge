import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** SHA-256 digests are stored as raw bytes; postgres.js maps `bytea` to `Buffer`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const timestamptz = (name: string) =>
  timestamp(name, { mode: "date", precision: 6, withTimezone: true });

/**
 * Members. Checks repeat the shared contract invariants so a bypassed or buggy
 * caller cannot persist a non-normalized identifier or a non-Argon2id hash.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized")
      .notNull()
      .unique("users_email_normalized_key"),
    username: varchar("username", { length: 30 })
      .notNull()
      .unique("users_username_key"),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    bio: varchar("bio", { length: 160 }).notNull().default(""),
    avatarKey: text("avatar_key"),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
    deletedAt: timestamptz("deleted_at"),
  },
  (table) => [
    check("users_email_length_check", sql`char_length(${table.email}) <= 254`),
    check(
      "users_email_normalized_check",
      sql`${table.emailNormalized} = lower(btrim(${table.emailNormalized}))`,
    ),
    check(
      "users_username_format_check",
      sql`${table.username} ~ '^[a-z][a-z0-9_]{2,29}$'`,
    ),
    check(
      "users_display_name_not_blank_check",
      sql`char_length(btrim(${table.displayName})) > 0`,
    ),
    check(
      "users_password_hash_argon2id_check",
      sql`${table.passwordHash} LIKE '$argon2id$%'`,
    ),
    // People search (US-D01): trigram indexes serve case-insensitive
    // substring matches of three or more characters. Usernames are stored
    // lowercase; display names are matched through lower().
    index("users_username_trgm_idx").using(
      "gin",
      sql`${table.username} gin_trgm_ops`,
    ),
    index("users_display_name_trgm_idx").using(
      "gin",
      sql`lower(${table.displayName}) gin_trgm_ops`,
    ),
  ],
);

/**
 * Opaque server-side sessions. Only SHA-256 digests of the cookie token and
 * CSRF secret are stored, so a database leak does not yield usable sessions.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull().unique("sessions_token_hash_key"),
    csrfSecretHash: bytea("csrf_secret_hash").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    lastSeenAt: timestamptz("last_seen_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
    userAgentHash: text("user_agent_hash"),
    ipPrefix: text("ip_prefix"),
  },
  (table) => [
    index("sessions_user_id_expires_at_idx").on(table.userId, table.expiresAt),
    index("sessions_active_expires_at_idx")
      .on(table.expiresAt)
      .where(sql`${table.revokedAt} IS NULL`),
    check(
      "sessions_token_hash_sha256_check",
      sql`octet_length(${table.tokenHash}) = 32`,
    ),
    check(
      "sessions_csrf_secret_hash_sha256_check",
      sql`octet_length(${table.csrfSecretHash}) = 32`,
    ),
    check(
      "sessions_expiry_after_creation_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);
