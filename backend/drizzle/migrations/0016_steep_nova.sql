ALTER TABLE "job_runs" ADD COLUMN "origin_queue_id" text;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "phase" text;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "monitor_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "recovered_automatically" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_job_runs_origin" ON "job_runs" USING btree ("origin_queue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_job_runs_running" ON "job_runs" USING btree ("job_id") WHERE "job_runs"."status" = 'RUNNING';--> statement-breakpoint
ALTER TABLE "scraping_jobs" DROP COLUMN "failure_count";
--> statement-breakpoint
ALTER TABLE "scraping_jobs" RENAME COLUMN "healing_attempts" TO "recovery_attempts";
--> statement-breakpoint
ALTER TABLE "scraping_jobs" RENAME COLUMN "healing_window_started_at" TO "recovery_window_started_at";
--> statement-breakpoint
UPDATE "scraping_jobs" SET "status" = 'RECOVERING' WHERE "status" = 'HEALING';
