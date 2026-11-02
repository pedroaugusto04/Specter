import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import type { ExtractedPayload, ExtractorConfig } from '../types/extractor.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    passwordHash: text('password_hash'),
    googleId: text('google_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_users_email').on(table.email)]
);

export const scrapingJobs = pgTable(
  'scraping_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().default('default-user'),
    url: text('url').notNull(),
    userPrompt: text('user_prompt').notNull(),
    notificationEmail: text('notification_email').notNull(),

    // Scheduling
    cronExpression: text('cron_expression').notNull().default('0 */6 * * *'),
    bullmqRepeatableKey: text('bullmq_repeatable_key'),

    // Compiled AI Extractor Configuration
    extractorConfig: jsonb('extractor_config').$type<ExtractorConfig>(),

    status: text('status', {
      enum: ['PENDING_COMPILATION', 'ACTIVE', 'FAILED', 'HEALING', 'PAUSED'],
    })
      .default('PENDING_COMPILATION')
      .notNull(),

    lastError: text('last_error'),
    failureCount: integer('failure_count').default(0).notNull(),

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

    extractedData: jsonb('extracted_data').$type<ExtractedPayload>(),
    normalizedHash: text('normalized_hash'),

    hasChanges: text('has_changes', { enum: ['YES', 'NO', 'INITIAL'] }).notNull(),
    status: text('status', { enum: ['SUCCESS', 'FAILED'] }).notNull(),
    errorMessage: text('error_message'),
    httpStatus: integer('http_status'),
    durationMs: integer('duration_ms'),

    executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_job_runs_job_id_executed_at').on(table.jobId, table.executedAt),
    index('idx_job_runs_retention').on(table.hasChanges, table.executedAt),
  ]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type ScrapingJobRow = typeof scrapingJobs.$inferSelect;
export type NewScrapingJobRow = typeof scrapingJobs.$inferInsert;
export type JobRunRow = typeof jobRuns.$inferSelect;
export type NewJobRunRow = typeof jobRuns.$inferInsert;
