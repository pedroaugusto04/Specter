import { z } from 'zod';
import { env } from '../config/env.js';
import { validateCronFrequency } from '../utils/cronValidator.js';

export const cronExpressionSchema = z
  .string()
  .default('0 */6 * * *')
  .refine(
    (cron) => validateCronFrequency(cron, env.MIN_CRON_INTERVAL_MINUTES).valid,
    {
      message: `Invalid cron expression or execution frequency lower than minimum allowed floor of ${env.MIN_CRON_INTERVAL_MINUTES} minutes.`,
    }
  );

export const jobInputSchema = z.object({
  userId: z.string().min(1).optional(),
  url: z
    .string()
    .url('Invalid URL')
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'URL must start with http:// or https://',
    }),
  userPrompt: z.string().min(5, 'Prompt must contain at least 5 characters'),
  notificationEmail: z.string().email('Invalid email address'),
  cronExpression: cronExpressionSchema,
});

export const jobUpdateSchema = z.object({
  url: z
    .string()
    .url('Invalid URL')
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'URL must start with http:// or https://',
    })
    .optional(),
  userPrompt: z.string().min(5, 'Prompt must contain at least 5 characters').optional(),
  notificationEmail: z.string().email('Invalid email address').optional(),
  cronExpression: z
    .string()
    .refine(
      (cron) => validateCronFrequency(cron, env.MIN_CRON_INTERVAL_MINUTES).valid,
      {
        message: `Invalid cron expression or execution frequency lower than minimum allowed floor of ${env.MIN_CRON_INTERVAL_MINUTES} minutes.`,
      }
    )
    .optional(),
});

export const jobPauseSchema = z.object({
  paused: z.boolean(),
});

export const jobStatusQuerySchema = z.object({
  status: z
    .enum(['PENDING_COMPILATION', 'ACTIVE', 'FAILED', 'HEALING', 'PAUSED'])
    .optional(),
});

export const jobRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
