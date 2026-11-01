CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"extracted_data" jsonb,
	"normalized_hash" text,
	"has_changes" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"http_status" integer,
	"duration_ms" integer,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraping_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'default-user' NOT NULL,
	"url" text NOT NULL,
	"user_prompt" text NOT NULL,
	"notification_email" text NOT NULL,
	"cron_expression" text DEFAULT '0 */6 * * *' NOT NULL,
	"bullmq_repeatable_key" text,
	"extractor_config" jsonb,
	"status" text DEFAULT 'PENDING_COMPILATION' NOT NULL,
	"last_error" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_scraping_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scraping_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_job_runs_job_id_executed_at" ON "job_runs" USING btree ("job_id","executed_at");--> statement-breakpoint
CREATE INDEX "idx_job_runs_retention" ON "job_runs" USING btree ("has_changes","executed_at");--> statement-breakpoint
CREATE INDEX "idx_scraping_jobs_status" ON "scraping_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_scraping_jobs_user_id" ON "scraping_jobs" USING btree ("user_id");