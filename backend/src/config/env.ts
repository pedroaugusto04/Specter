import 'dotenv/config';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Database & Redis
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid connection URL')
    .default('postgresql://postgres:postgres@localhost:5432/dynamic_scrapper'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis URL').default('redis://localhost:6379'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  // AI Compiler Provider
  COMPILER_PROVIDER: z.enum(['agy', 'codex']).default('agy'),
  AGY_CLI_PATH: z.string().min(1).default('agy'),
  CODEX_CLI_PATH: z.string().min(1).default('codex'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  COMPILER_TEMP_DIR: z.string().min(1).default('/tmp/scraper_jobs'),
  COMPILER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(600000),
  COMPILER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),

  // Scraping Engine & Concurrency
  SCRAPER_ENGINE: z.enum(['playwright', 'cheerio']).default('playwright'),
  SCRAPER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  PLAYWRIGHT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120000),

  // Proxy & Anti-Bot Unblocker Providers (Optional Fallback Cascade)
  HTTP_PROXY: z.string().optional().default(''),
  ZENROWS_API_KEY: z.string().optional().default(''),
  SCRAPERAPI_KEY: z.string().optional().default(''),
  SCRAPINGBEE_API_KEY: z.string().optional().default(''),
  CRAWLBASE_TOKEN: z.string().optional().default(''),

  // Guardrails & Self-Healing
  MIN_CRON_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
  CONSECUTIVE_FAILURES_FOR_HEALING: z.coerce.number().int().min(1).default(2),
  MAX_HEALING_RETRIES: z.coerce.number().int().min(1).default(3),
  RETENTION_DAYS_UNCHANGED: z.coerce.number().int().min(1).default(14),

  // Notifications
  NOTIFICATION_PROVIDER: z.enum(['resend', 'console']).default('console'),
  RESEND_API_KEY: z.string().optional().default(''),
  NOTIFICATION_FROM_EMAIL: z.string().min(1).default('onboarding@resend.dev'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formattedErrors}`);
  }

  const parsed = result.data;

  if (
    parsed.NOTIFICATION_PROVIDER === 'resend' &&
    !parsed.RESEND_API_KEY &&
    parsed.NODE_ENV !== 'test'
  ) {
    throw new Error(
      'Invalid environment configuration:\n  - RESEND_API_KEY: Required when NOTIFICATION_PROVIDER is set to "resend"'
    );
  }

  return parsed;
}

export const env: AppEnv = parseEnv(process.env);
