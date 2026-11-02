ALTER TABLE "job_runs" ADD COLUMN "screenshot_url" text;--> statement-breakpoint
ALTER TABLE "scraping_jobs" ADD COLUMN "capture_screenshot_on_change" boolean DEFAULT false NOT NULL;