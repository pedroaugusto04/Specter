ALTER TABLE "job_runs" ADD COLUMN "extraction_report" jsonb;--> statement-breakpoint
ALTER TABLE "scraping_jobs" ADD COLUMN "healing_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scraping_jobs" ADD COLUMN "healing_window_started_at" timestamp with time zone;--> statement-breakpoint
UPDATE scraping_jobs SET extractor_config = NULL, bullmq_repeatable_key = NULL,
status = CASE WHEN status IN ('ACTIVE', 'HEALING') THEN 'PENDING_COMPILATION' ELSE status END,
last_error = 'The extraction engine was upgraded. Recompilation is required.';
