CREATE TABLE "tweets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"author_id" uuid NOT NULL,
	"content" varchar(280) NOT NULL,
	"created_at" timestamp (6) with time zone NOT NULL,
	"updated_at" timestamp (6) with time zone,
	CONSTRAINT "tweets_content_not_blank_check" CHECK (char_length(btrim("tweets"."content")) > 0),
	CONSTRAINT "tweets_content_trimmed_check" CHECK ("tweets"."content" = btrim("tweets"."content", E' \t\n\r'))
);
--> statement-breakpoint
ALTER TABLE "tweets" ADD CONSTRAINT "tweets_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tweets_author_id_created_at_id_idx" ON "tweets" USING btree ("author_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tweets_created_at_id_idx" ON "tweets" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);