CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"destination" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claim_token" text,
	"locked_until" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scraping_jobs" ADD COLUMN "plan_revision" text;--> statement-breakpoint
ALTER TABLE "scraping_jobs" ADD COLUMN "semantic_policy" jsonb;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_job_id_scraping_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scraping_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_run_id_job_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."job_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_alert_delivery_unique" ON "alert_deliveries" USING btree ("run_id","channel","destination");--> statement-breakpoint
CREATE INDEX "idx_alert_delivery_pending" ON "alert_deliveries" USING btree ("status","next_attempt_at");
--> statement-breakpoint
UPDATE "scraping_jobs" SET "extractor_config" = NULL, "contract_revision" = NULL, "plan_revision" = NULL, "bullmq_repeatable_key" = NULL,
  "status" = CASE WHEN "status" IN ('ACTIVE', 'HEALING') THEN 'PENDING_COMPILATION' ELSE "status" END,
  "failure_count" = 0
WHERE "extractor_config" IS NOT NULL OR "status" IN ('ACTIVE', 'HEALING');
