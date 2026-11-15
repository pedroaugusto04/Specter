import { z } from 'zod';
import { JobStatus, TriggerMatchMode, TriggerOperator } from '../types/enums.js';
import { env } from '../config/env.js';
import { validateCronFrequency } from '../utils/cronValidator.js';

// ============================================================================
// Shared Primitive Schemas
// ============================================================================

export const cronExpressionSchema = z
  .string({ required_error: 'Cron expression is required' })
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

export const targetUrlSchema = z
  .string({ required_error: 'Target URL is required' })
  .trim()
  .min(1, 'Target URL is required')
  .url('Target URL must be a valid URL format (e.g. https://example.com)')
  .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
    message: 'Target URL must start with http:// or https://',
  });

export const webhookUrlStringSchema = z
  .string({ required_error: 'Webhook URL is required' })
  .trim()
  .url('Webhook URL must be a valid HTTP or HTTPS URL')
  .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
    message: 'Webhook URL must start with http:// or https://',
  });

export const optionalWebhookUrlSchema = webhookUrlStringSchema
  .optional()
  .or(z.literal(''))
  .nullable();

export const webhookSecretSchema = z
  .string()
  .trim()
  .max(256, 'Webhook secret must not exceed 256 characters');

export const monitorNameSchema = z
  .string()
  .trim()
  .min(1, 'Monitor name is required')
  .max(80, 'Monitor name must be 80 characters or fewer');

export const userPromptSchema = z
  .string({ required_error: 'Extraction instructions are required' })
  .trim()
  .min(1, 'Extraction instructions are required')
  .min(5, 'Extraction instructions must contain at least 5 characters');

export const emailAddressSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

export const alertNotificationEmailSchema = z
  .string()
  .trim()
  .email('Please enter a valid alert email address (e.g. alerts@company.com)');

// ============================================================================
// Trigger Rule Schemas
// ============================================================================

export const triggerRuleSchema = z.object({
  field: z.string().trim().min(1, 'Field is required'),
  operator: z.nativeEnum(TriggerOperator),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const triggerMatchModeSchema = z.nativeEnum(TriggerMatchMode);

// ============================================================================
// Job Schemas
// ============================================================================

export const jobProbeSchema = z.object({
  url: targetUrlSchema,
});

export const jobInputSchema = z.object({
  name: monitorNameSchema.optional(),
  userId: z.string().trim().min(1).optional(),
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
  paused: z.boolean({ required_error: 'Paused state is required' }),
});

export const jobStatusQuerySchema = z.object({
  status: z
    .nativeEnum(JobStatus, { errorMap: () => ({ message: 'Invalid status filter' }) })
    .optional(),
});

export const jobRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'Page size must be at least 1')
    .max(100, 'Page size cannot exceed 100')
    .default(20),
});

export const jobTimeseriesQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d', 'all']).default('all'),
});

// ============================================================================
// Auth & Profile Schemas
// ============================================================================

export const authRegisterSchema = z.object({
  email: emailAddressSchema,
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().max(100).optional(),
});

export const authLoginSchema = z.object({
  email: emailAddressSchema,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

export const authProfileUpdateSchema = z.object({
  name: z.string().trim().nullable().optional(),
  timezone: z
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
        message:
          'Invalid IANA timezone format (e.g. "America/Sao_Paulo", "UTC", "America/New_York")',
      }
    )
    .optional(),
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
