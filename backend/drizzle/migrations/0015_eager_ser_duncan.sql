CREATE TABLE "user_monthly_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"compilations_count" integer DEFAULT 0 NOT NULL,
	"executions_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_monthly_usage" ADD CONSTRAINT "user_monthly_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_monthly_usage_user_period" ON "user_monthly_usage" USING btree ("user_id","period");--> statement-breakpoint
CREATE INDEX "idx_user_monthly_usage_user_id" ON "user_monthly_usage" USING btree ("user_id");