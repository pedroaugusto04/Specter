ALTER TABLE "scraping_jobs" RENAME COLUMN "extractor_config" TO "extraction_plan";--> statement-breakpoint
ALTER TABLE "scraping_jobs" ALTER COLUMN "notification_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scraping_jobs" ADD COLUMN "webhook_secret" text;
