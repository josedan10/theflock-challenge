CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"csrf_secret_hash" "bytea" NOT NULL,
	"created_at" timestamp (6) with time zone NOT NULL,
	"last_seen_at" timestamp (6) with time zone NOT NULL,
	"expires_at" timestamp (6) with time zone NOT NULL,
	"revoked_at" timestamp (6) with time zone,
	"user_agent_hash" text,
	"ip_prefix" text,
	CONSTRAINT "sessions_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "sessions_token_hash_sha256_check" CHECK (octet_length("sessions"."token_hash") = 32),
	CONSTRAINT "sessions_csrf_secret_hash_sha256_check" CHECK (octet_length("sessions"."csrf_secret_hash") = 32),
	CONSTRAINT "sessions_expiry_after_creation_check" CHECK ("sessions"."expires_at" > "sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"username" varchar(30) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"bio" varchar(160) DEFAULT '' NOT NULL,
	"avatar_key" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp (6) with time zone NOT NULL,
	"updated_at" timestamp (6) with time zone NOT NULL,
	"deleted_at" timestamp (6) with time zone,
	CONSTRAINT "users_email_normalized_key" UNIQUE("email_normalized"),
	CONSTRAINT "users_username_key" UNIQUE("username"),
	CONSTRAINT "users_email_length_check" CHECK (char_length("users"."email") <= 254),
	CONSTRAINT "users_email_normalized_check" CHECK ("users"."email_normalized" = lower(btrim("users"."email_normalized"))),
	CONSTRAINT "users_username_format_check" CHECK ("users"."username" ~ '^[a-z][a-z0-9_]{2,29}$'),
	CONSTRAINT "users_display_name_not_blank_check" CHECK (char_length(btrim("users"."display_name")) > 0),
	CONSTRAINT "users_password_hash_argon2id_check" CHECK ("users"."password_hash" LIKE '$argon2id$%')
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "sessions_active_expires_at_idx" ON "sessions" USING btree ("expires_at") WHERE "sessions"."revoked_at" IS NULL;