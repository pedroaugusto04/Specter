ALTER TABLE "scraping_jobs" ADD COLUMN "name" text;--> statement-breakpoint
WITH numbered_jobs AS (
  SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at", "id") AS ordinal
  FROM "scraping_jobs"
)
UPDATE "scraping_jobs" AS jobs
SET "name" = 'Monitor ' || numbered_jobs.ordinal
FROM numbered_jobs
WHERE jobs."id" = numbered_jobs."id";--> statement-breakpoint
ALTER TABLE "scraping_jobs" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scraping_jobs_user_name" ON "scraping_jobs" USING btree ("user_id",lower("name"));
