CREATE TABLE "job_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"plan_revision" text NOT NULL,
	"contract_revision" text,
	"url" text NOT NULL,
	"user_prompt" text NOT NULL,
	"extraction_plan" jsonb NOT NULL,
	"trigger_reason" text NOT NULL,
	"created_by_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_plan_versions" ADD CONSTRAINT "job_plan_versions_job_id_scraping_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scraping_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_plan_versions" ADD CONSTRAINT "job_plan_versions_created_by_run_id_job_runs_id_fk" FOREIGN KEY ("created_by_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_job_plan_versions_job_id" ON "job_plan_versions" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_job_plan_version" ON "job_plan_versions" USING btree ("job_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_job_plan_versions_created_at" ON "job_plan_versions" USING btree ("job_id","created_at");--> statement-breakpoint
INSERT INTO "job_plan_versions" ("job_id", "version_number", "plan_revision", "contract_revision", "url", "user_prompt", "extraction_plan", "trigger_reason", "created_at")
SELECT "id", 1, COALESCE("plan_revision", 'initial'), "contract_revision", "url", "user_prompt", "extraction_plan", 'initial', "created_at"
FROM "scraping_jobs"
WHERE "extraction_plan" IS NOT NULL
ON CONFLICT DO NOTHING;