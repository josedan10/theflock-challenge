-- pg_trgm is a trusted extension (PostgreSQL 13+): the database owner can
-- create it without superuser. It backs the people-search indexes below.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "users_username_trgm_idx" ON "users" USING gin ("username" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_display_name_trgm_idx" ON "users" USING gin (lower("display_name") gin_trgm_ops);