import type { ExtractionReport, ExtractionPlan } from '../types/extractionPlan.js';
import { ChangeStatus, JobStatus, RunStatus } from '../types/enums.js';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import type { ExtractedPayload } from '../types/extractor.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    passwordHash: text('password_hash'),
    googleId: text('google_id').unique(),
    timezone: text('timezone').default('America/Sao_Paulo').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_users_email').on(table.email)]
);

export const userIntegrations = pgTable(
  'user_integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),

    // Telegram Integration
    telegramEnabled: boolean('telegram_enabled').default(false).notNull(),
    telegramBotToken: text('telegram_bot_token'),
    telegramChatId: text('telegram_chat_id'),

    // Webhook Integration
    webhookEnabled: boolean('webhook_enabled').default(false).notNull(),
    webhookUrl: text('webhook_url'),
    webhookSecret: text('webhook_secret'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_user_integrations_user_id').on(table.userId)]
);

export const scrapingJobs = pgTable(
  'scraping_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    url: text('url').notNull(),
    userPrompt: text('user_prompt').notNull(),
    notificationEmail: text('notification_email').notNull(),
    webhookUrl: text('webhook_url'),

    // Scheduling
    cronExpression: text('cron_expression').notNull().default('0 */6 * * *'),
    bullmqRepeatableKey: text('bullmq_repeatable_key'),

    // Compiled AI Extractor Configuration
    contractRevision: text('contract_revision'),
    extractionPlan: jsonb('extractor_config').$type<ExtractionPlan>(),

    status: text('status', {
      enum: Object.values(JobStatus) as [string, ...string[]],
    })
      .default(JobStatus.PendingCompilation)
      .notNull(),

    lastError: text('last_error'),
    failureCount: integer('failure_count').default(0).notNull(),

    healingAttempts: integer('healing_attempts').default(0).notNull(),
    healingWindowStartedAt: timestamp('healing_window_started_at', { withTimezone: true }),

    // Visual Diff Screenshot Option (Defaults to false)
    captureScreenshotOnChange: boolean('capture_screenshot_on_change').default(false).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_scraping_jobs_status').on(table.status),
    index('idx_scraping_jobs_user_id').on(table.userId),
  ]
);

export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .references(() => scrapingJobs.id, { onDelete: 'cascade' })
      .notNull(),

    contractRevision: text('contract_revision'),
    extractionReport: jsonb('extraction_report').$type<ExtractionReport>(),
    extractedData: jsonb('extracted_data').$type<ExtractedPayload>(),
    normalizedHash: text('normalized_hash'),

    hasChanges: text('has_changes', {
      enum: Object.values(ChangeStatus) as [string, ...string[]],
    }).notNull(),
    status: text('status', { enum: Object.values(RunStatus) as [string, ...string[]] }).notNull(),
    errorMessage: text('error_message'),
    httpStatus: integer('http_status'),
    durationMs: integer('duration_ms'),
    screenshotUrl: text('screenshot_url'),

    executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_job_runs_job_id_executed_at').on(table.jobId, table.executedAt),
    index('idx_job_runs_retention').on(table.hasChanges, table.executedAt),
  ]
);

export interface PlaywrightStorageCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface PlaywrightStorageOrigin {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
}

export interface PlaywrightStorageState {
  cookies: PlaywrightStorageCookie[];
  origins: PlaywrightStorageOrigin[];
}

export const userWebSessions = pgTable(
  'user_web_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    domain: text('domain').notNull(),
    name: text('name').notNull(),
    storageState: jsonb('storage_state').$type<PlaywrightStorageState>().notNull(),
    cookieCount: integer('cookie_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_user_web_sessions_user_domain').on(table.userId, table.domain),
    index('idx_user_web_sessions_user_id').on(table.userId),
  ]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type ScrapingJobRow = typeof scrapingJobs.$inferSelect;
export type NewScrapingJobRow = typeof scrapingJobs.$inferInsert;
export type JobRunRow = typeof jobRuns.$inferSelect;
export type NewJobRunRow = typeof jobRuns.$inferInsert;
export type UserIntegrationRow = typeof userIntegrations.$inferSelect;
export type NewUserIntegrationRow = typeof userIntegrations.$inferInsert;
export type UserWebSessionRow = typeof userWebSessions.$inferSelect;
export type NewUserWebSessionRow = typeof userWebSessions.$inferInsert;
