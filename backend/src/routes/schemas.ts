import {
  PAGINATION_DEFAULT_PAGE_SIZE,
  PAGINATION_RUNS_PAGE_SIZE,
  PAGINATION_TIMESERIES_PAGE_SIZE,
} from '@specter/contracts';
import { z } from 'zod';
import { env } from '../config/env.js';
import { JobStatus, TriggerMatchMode, TriggerOperator } from '../types/enums.js';
import { validateCronFrequency } from '../utils/cronValidator.js';
import { createPaginationQuerySchema } from '../utils/pagination.js';

// ============================================================================
// Shared Primitive Schemas
// ============================================================================

const cronExpressionSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Cron expression is required' : undefined),
  })
  .trim()
  .min(1, 'Cron expression is required')
  .superRefine((cron, ctx) => {
    const res = validateCronFrequency(cron, env.MIN_CRON_INTERVAL_MINUTES);
    if (!res.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          res.error ??
          `Invalid cron expression or execution frequency lower than minimum allowed floor of ${env.MIN_CRON_INTERVAL_MINUTES} minutes.`,
      });
    }
  });

const targetUrlSchema = z
  .string({ error: (issue) => (issue.input === undefined ? 'Target URL is required' : undefined) })
  .trim()
  .min(1, 'Target URL is required')
  .url('Target URL must be a valid URL format (e.g. https://example.com)')
  .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
    message: 'Target URL must start with http:// or https://',
  });

const webhookUrlStringSchema = z
  .string({ error: (issue) => (issue.input === undefined ? 'Webhook URL is required' : undefined) })
  .trim()
  .url('Webhook URL must be a valid HTTP or HTTPS URL')
  .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
    message: 'Webhook URL must start with http:// or https://',
  });

const optionalWebhookUrlSchema = webhookUrlStringSchema.optional().or(z.literal('')).nullable();

const webhookSecretSchema = z
  .string()
  .trim()
  .max(256, 'Webhook secret must not exceed 256 characters');

const monitorNameSchema = z
  .string()
  .trim()
  .min(1, 'Monitor name is required')
  .max(80, 'Monitor name must be 80 characters or fewer');

const userPromptSchema = z
  .string({
    error: (issue) =>
      issue.input === undefined ? 'Extraction instructions are required' : undefined,
  })
  .trim()
  .min(5, 'Extraction instructions must contain at least 5 characters');

const emailAddressSchema = z
  .string({ error: (issue) => (issue.input === undefined ? 'Email is required' : undefined) })
  .trim()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

const alertNotificationEmailSchema = z
  .string()
  .trim()
  .email('Please enter a valid alert email address (e.g. alerts@company.com)');

const triggerRuleSchema = z.object({
  field: z.string().trim().min(1, 'Field is required'),
  operator: z.nativeEnum(TriggerOperator),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const triggerMatchModeSchema = z.nativeEnum(TriggerMatchMode);

const ianaTimezoneSchema = z
  .string()
  .trim()
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    {
      message: 'Invalid IANA timezone format (e.g. "America/Sao_Paulo", "UTC", "America/New_York")',
    }
  );

const pageLanguageSchema = z
  .string()
  .trim()
  .max(64)
  .transform((value, ctx) => {
    try {
      return new Intl.Locale(value).baseName;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid language tag (e.g. en-US or pt-BR)' });
      return z.NEVER;
    }
  });

// ============================================================================
// Job Schemas
// ============================================================================

export const jobProbeSchema = z.object({
  url: targetUrlSchema,
});

export const jobInputSchema = z.object({
  name: monitorNameSchema.optional(),
  url: targetUrlSchema,
  userPrompt: userPromptSchema,
  notificationEmail: alertNotificationEmailSchema.optional().or(z.literal('')).default(''),
  webhookUrl: optionalWebhookUrlSchema,
  webhookSecret: webhookSecretSchema.optional().nullable(),
  cronExpression: cronExpressionSchema.default('0 */6 * * *'),
  captureScreenshotOnChange: z.boolean().default(false),
});

export const jobUpdateSchema = z.object({
  name: monitorNameSchema.optional(),
  url: targetUrlSchema.optional(),
  userPrompt: userPromptSchema.optional(),
  notificationEmail: alertNotificationEmailSchema.optional().or(z.literal('')),
  webhookUrl: optionalWebhookUrlSchema,
  webhookSecret: webhookSecretSchema.optional().nullable(),
  cronExpression: cronExpressionSchema.optional(),
  captureScreenshotOnChange: z.boolean().optional(),
  triggerRules: z.array(triggerRuleSchema).optional(),
  triggerMatchMode: triggerMatchModeSchema.optional(),
});

export const jobPauseSchema = z.object({
  paused: z.boolean({
    error: (issue) => (issue.input === undefined ? 'Paused state is required' : undefined),
  }),
});

export const paginationQuerySchema = createPaginationQuerySchema(PAGINATION_DEFAULT_PAGE_SIZE);

export const listQuerySchema = paginationQuerySchema.extend({
  status: z.union([z.nativeEnum(JobStatus), z.enum(['recovering', 'paused'])]).optional(),
  search: z.string().trim().max(200).optional(),
});

export const jobRunsQuerySchema = createPaginationQuerySchema(PAGINATION_RUNS_PAGE_SIZE);
export const jobPlanVersionsQuerySchema = createPaginationQuerySchema(10);
export const rollbackJobSchema = z.object({
  versionNumber: z.number().int().positive('Version number must be a positive integer'),
});
export const jobTimeseriesQuerySchema = createPaginationQuerySchema(
  PAGINATION_TIMESERIES_PAGE_SIZE
).extend({
  range: z.enum(['24h', '7d', '30d', 'all']).default('all'),
});

// ============================================================================
// Auth & Profile Schemas
// ============================================================================

export const authRegisterSchema = z.object({
  email: emailAddressSchema,
  password: z
    .string({ error: (issue) => (issue.input === undefined ? 'Password is required' : undefined) })
    .min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().max(100).optional(),
  timezone: ianaTimezoneSchema.optional(),
});

export const authLoginSchema = z.object({
  email: emailAddressSchema,
  password: z
    .string({ error: (issue) => (issue.input === undefined ? 'Password is required' : undefined) })
    .min(1, 'Password is required'),
});

export const authProfileUpdateSchema = z.object({
  name: z.string().trim().nullable().optional(),
  timezone: ianaTimezoneSchema.optional(),
  pageLanguage: pageLanguageSchema.nullable().optional(),
  browserPageLanguage: pageLanguageSchema.nullable().optional(),
});

// ============================================================================
// Integration Schemas
// ============================================================================

export const updateIntegrationsSchema = z.object({
  telegramEnabled: z.boolean().default(false),
  telegramChatId: z.string().trim().optional().nullable(),
  webhookEnabled: z.boolean().default(false),
  webhookUrl: optionalWebhookUrlSchema,
  webhookSecret: webhookSecretSchema.optional().nullable(),
});

export const testTelegramSchema = z.object({
  chatId: z.string().trim().min(1, 'Telegram Chat ID is required'),
});

export const testWebhookSchema = z.object({
  webhookUrl: webhookUrlStringSchema,
  secret: webhookSecretSchema.optional().nullable(),
});

// ============================================================================
// Session Sync Schemas
// ============================================================================

export const syncSessionSchema = z.object({
  domain: z.string().trim().min(1, 'Domain is required'),
  name: z.string().trim().optional(),
  cookies: z
    .array(
      z.object({
        name: z.string().min(1, 'Cookie name is required'),
        value: z.string(),
        domain: z.string().optional(),
        path: z.string().optional(),
        expires: z.number().optional(),
        httpOnly: z.boolean().optional(),
        secure: z.boolean().optional(),
        sameSite: z.string().optional(),
      })
    )
    .min(1, 'At least one cookie is required to sync a session'),
  origins: z
    .array(
      z.object({
        origin: z.string(),
        localStorage: z.array(
          z.object({
            name: z.string(),
            value: z.string(),
          })
        ),
      })
    )
    .optional(),
});

export const sessionCheckQuerySchema = z
  .object({
    domain: z.string().trim().optional(),
    url: z.string().trim().optional(),
  })
  .refine((data) => Boolean(data.domain || data.url), {
    message: 'Query parameter "domain" or "url" is required.',
    path: ['domain'],
  });
