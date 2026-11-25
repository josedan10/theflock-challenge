CREATE TABLE "media_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"object_key" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"declared_mime_type" varchar(32) NOT NULL,
	"declared_byte_size" integer NOT NULL,
	"mime_type" varchar(32),
	"byte_size" integer,
	"width" integer,
	"height" integer,
	"status" varchar(16) NOT NULL,
	"expires_at" timestamp (6) with time zone NOT NULL,
	"tweet_id" uuid,
	"created_at" timestamp (6) with time zone NOT NULL,
	CONSTRAINT "media_uploads_token_hash_len" CHECK (octet_length("media_uploads"."token_hash") = 32),
	CONSTRAINT "media_uploads_declared_mime_check" CHECK ("media_uploads"."declared_mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "media_uploads_declared_size_check" CHECK ("media_uploads"."declared_byte_size" between 1 and 5242880),
	CONSTRAINT "media_uploads_status_check" CHECK ("media_uploads"."status" in ('pending', 'verified', 'attached', 'rejected')),
	CONSTRAINT "media_uploads_attached_tweet_check" CHECK (("media_uploads"."status" = 'attached') = ("media_uploads"."tweet_id" is not null)),
	CONSTRAINT "media_uploads_verified_image_check" CHECK ((
        "media_uploads"."status" in ('pending', 'rejected')
        and "media_uploads"."mime_type" is null
        and "media_uploads"."byte_size" is null
        and "media_uploads"."width" is null
        and "media_uploads"."height" is null
      ) or (
        "media_uploads"."status" in ('verified', 'attached')
        and "media_uploads"."mime_type" in ('image/jpeg', 'image/png', 'image/webp')
        and "media_uploads"."byte_size" between 1 and 5242880
        and "media_uploads"."width" between 1 and 4096
        and "media_uploads"."height" between 1 and 4096
      ))
);
--> statement-breakpoint
CREATE TABLE "tweet_media" (
	"tweet_id" uuid PRIMARY KEY NOT NULL,
	"object_key" uuid NOT NULL,
	"mime_type" varchar(32) NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"status" varchar(16) NOT NULL,
	"alt_text" text NOT NULL,
	"created_at" timestamp (6) with time zone NOT NULL,
	CONSTRAINT "tweet_media_status_check" CHECK ("tweet_media"."status" = 'attached'),
	CONSTRAINT "tweet_media_mime_check" CHECK ("tweet_media"."mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "tweet_media_size_check" CHECK ("tweet_media"."byte_size" between 1 and 5242880),
	CONSTRAINT "tweet_media_dimensions_check" CHECK ("tweet_media"."width" between 1 and 4096 and "tweet_media"."height" between 1 and 4096),
	CONSTRAINT "tweet_media_alt_check" CHECK (char_length("tweet_media"."alt_text") between 1 and 200 and "tweet_media"."alt_text" = btrim("tweet_media"."alt_text"))
);
--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_tweet_id_tweets_id_fk" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tweet_media" ADD CONSTRAINT "tweet_media_tweet_id_tweets_id_fk" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_uploads_object_key_key" ON "media_uploads" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_uploads_tweet_id_key" ON "media_uploads" USING btree ("tweet_id");--> statement-breakpoint
CREATE INDEX "media_uploads_expires_idx" ON "media_uploads" USING btree ("expires_at") WHERE "media_uploads"."status" in ('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE UNIQUE INDEX "tweet_media_object_key_key" ON "tweet_media" USING btree ("object_key");