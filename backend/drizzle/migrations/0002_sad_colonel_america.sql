CREATE TABLE "user_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"telegram_enabled" boolean DEFAULT false NOT NULL,
	"telegram_bot_token" text,
	"telegram_chat_id" text,
	"webhook_enabled" boolean DEFAULT false NOT NULL,
	"webhook_url" text,
	"webhook_secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_integrations_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "scraping_jobs" ADD COLUMN "webhook_url" text;--> statement-breakpoint
CREATE INDEX "idx_user_integrations_user_id" ON "user_integrations" USING btree ("user_id");