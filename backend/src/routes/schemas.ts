import { z } from 'zod';
import { env } from '../config/env.js';
import { validateCronFrequency } from '../utils/cronValidator.js';

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

export const triggerRuleSchema = z.object({
  field: z.string().trim().min(1, 'Field is required'),
  operator: z.enum([
    'lt',
    'lte',
    'gt',
    'gte',
    'eq',
    'neq',
    'contains',
    'not_contains',
    'percentage_drop',
    'percentage_increase',
    'decreased',
    'increased',
    'changes',
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const triggerMatchModeSchema = z.enum(['any', 'all']);

export const jobProbeSchema = z.object({
  url: z
    .string({ required_error: 'Target URL is required' })
    .trim()
    .min(1, 'Target URL is required')
    .url('Target URL must be a valid URL format (e.g. https://example.com)')
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'Target URL must start with http:// or https://',
    }),
});

export const jobInputSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  url: z
    .string({ required_error: 'Target URL is required' })
    .trim()
    .min(1, 'Target URL is required')
    .url('Target URL must be a valid URL format (e.g. https://example.com)')
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'Target URL must start with http:// or https://',
    }),
  userPrompt: z
    .string({ required_error: 'Extraction instructions are required' })
    .trim()
    .min(1, 'Extraction instructions are required')
    .min(5, 'Extraction instructions must contain at least 5 characters'),
  notificationEmail: z
    .string()
    .trim()
    .email('Please enter a valid alert email address (e.g. alerts@company.com)')
    .optional()
    .or(z.literal(''))
    .default(''),
  webhookUrl: z
    .string()
    .trim()
    .url('Webhook URL must be a valid HTTP or HTTPS URL')
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'Webhook URL must start with http:// or https://',
    })
    .optional()
    .or(z.literal(''))
    .nullable(),
  cronExpression: cronExpressionSchema.default('0 */6 * * *'),
});

export const jobUpdateSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Target URL is required')
    .url('Target URL must be a valid URL format (e.g. https://example.com)')
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'Target URL must start with http:// or https://',
    })
    .optional(),
  userPrompt: z
    .string()
    .trim()
    .min(1, 'Extraction instructions are required')
    .min(5, 'Extraction instructions must contain at least 5 characters')
    .optional(),
  notificationEmail: z
    .string()
    .trim()
    .email('Please enter a valid alert email address (e.g. alerts@company.com)')
    .optional()
    .or(z.literal('')),
  webhookUrl: z
    .string()
    .trim()
    .url('Webhook URL must be a valid HTTP or HTTPS URL')
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'Webhook URL must start with http:// or https://',
    })
    .optional()
    .or(z.literal(''))
    .nullable(),
  cronExpression: cronExpressionSchema.optional(),
  triggerRules: z.array(triggerRuleSchema).optional(),
  triggerMatchMode: triggerMatchModeSchema.optional(),
});

export const jobPauseSchema = z.object({
  paused: z.boolean({ required_error: 'Paused state is required' }),
});

export const jobStatusQuerySchema = z.object({
  status: z
    .enum(['PENDING_COMPILATION', 'ACTIVE', 'FAILED', 'HEALING', 'PAUSED'], {
      errorMap: () => ({ message: 'Invalid status filter' }),
    })
    .optional(),
});

export const jobRunsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(200, 'Limit cannot exceed 200')
    .default(50),
});

export const authRegisterSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().max(100).optional(),
});

export const authLoginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export const updateIntegrationsSchema = z.object({
  telegramEnabled: z.boolean().default(false),
  telegramChatId: z.string().trim().optional().nullable(),
  webhookEnabled: z.boolean().default(false),
  webhookUrl: z
    .string()
    .trim()
    .url('Webhook URL must be a valid HTTP or HTTPS URL')
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'Webhook URL must start with http:// or https://',
    })
    .optional()
    .nullable()
    .or(z.literal('')),
  webhookSecret: z.string().trim().optional().nullable(),
});

export const testTelegramSchema = z.object({
  chatId: z.string().trim().min(1, 'Telegram Chat ID is required'),
});

export const testWebhookSchema = z.object({
  webhookUrl: z
    .string({ required_error: 'Webhook URL is required' })
    .trim()
    .url('Webhook URL must be a valid HTTP or HTTPS URL')
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'Webhook URL must start with http:// or https://',
    }),
  secret: z.string().trim().optional().nullable(),
});

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
