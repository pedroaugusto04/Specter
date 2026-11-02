CREATE TABLE "user_web_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"storage_state" jsonb NOT NULL,
	"cookie_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_user_web_sessions_user_domain" ON "user_web_sessions" USING btree ("user_id","domain");--> statement-breakpoint
CREATE INDEX "idx_user_web_sessions_user_id" ON "user_web_sessions" USING btree ("user_id");