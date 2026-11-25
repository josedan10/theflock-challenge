CREATE TABLE "tweet_descendants" (
	"ancestor_id" uuid NOT NULL,
	"descendant_id" uuid NOT NULL,
	"created_at" timestamp (6) with time zone NOT NULL,
	CONSTRAINT "tweet_descendants_descendant_id_ancestor_id_pk" PRIMARY KEY("descendant_id","ancestor_id"),
	CONSTRAINT "tweet_descendants_no_self" CHECK ("tweet_descendants"."ancestor_id" <> "tweet_descendants"."descendant_id")
);
--> statement-breakpoint
ALTER TABLE "tweets" ADD COLUMN "parent_tweet_id" uuid;--> statement-breakpoint
ALTER TABLE "tweet_descendants" ADD CONSTRAINT "tweet_descendants_ancestor_id_tweets_id_fk" FOREIGN KEY ("ancestor_id") REFERENCES "public"."tweets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tweet_descendants" ADD CONSTRAINT "tweet_descendants_descendant_id_tweets_id_fk" FOREIGN KEY ("descendant_id") REFERENCES "public"."tweets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tweet_descendants_page_idx" ON "tweet_descendants" USING btree ("ancestor_id","created_at","descendant_id");--> statement-breakpoint
ALTER TABLE "tweets" ADD CONSTRAINT "tweets_parent_tweet_id_tweets_id_fk" FOREIGN KEY ("parent_tweet_id") REFERENCES "public"."tweets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tweets_parent_tweet_id_idx" ON "tweets" USING btree ("parent_tweet_id") WHERE "tweets"."parent_tweet_id" is not null;--> statement-breakpoint
ALTER TABLE "tweets" ADD CONSTRAINT "tweets_not_own_parent" CHECK ("tweets"."parent_tweet_id" <> "tweets"."id");
--> statement-breakpoint
-- A reply must name an already-inserted parent. Enforce causal order even if
-- writers' clocks drift or a transaction creates an entire branch at one instant.
CREATE FUNCTION prepare_reply() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_time timestamptz;
BEGIN
  SELECT created_at INTO parent_time FROM tweets WHERE id = NEW.parent_tweet_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE = 'Reply parent does not exist'; END IF;
  NEW.created_at := greatest(NEW.created_at, parent_time + interval '1 microsecond');
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER tweets_prepare_reply BEFORE INSERT ON tweets
  FOR EACH ROW WHEN (NEW.parent_tweet_id IS NOT NULL) EXECUTE FUNCTION prepare_reply();
--> statement-breakpoint
CREATE FUNCTION index_reply_ancestors() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO tweet_descendants(ancestor_id, descendant_id, created_at)
    SELECT NEW.parent_tweet_id, NEW.id, NEW.created_at
    UNION ALL
    SELECT ancestor_id, NEW.id, NEW.created_at FROM tweet_descendants
    WHERE descendant_id = NEW.parent_tweet_id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER tweets_index_reply AFTER INSERT ON tweets
  FOR EACH ROW WHEN (NEW.parent_tweet_id IS NOT NULL) EXECUTE FUNCTION index_reply_ancestors();
--> statement-breakpoint
CREATE FUNCTION reject_thread_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE check_violation USING MESSAGE = 'Tweet parent and publication time are immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER tweets_keep_topology BEFORE UPDATE OF parent_tweet_id, created_at ON tweets
  FOR EACH ROW WHEN (OLD.parent_tweet_id IS DISTINCT FROM NEW.parent_tweet_id OR OLD.created_at <> NEW.created_at)
  EXECUTE FUNCTION reject_thread_rewrite();
