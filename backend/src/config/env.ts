import 'dotenv/config';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY_CONSOLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  // Database & Redis
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid connection URL')
    .default('postgresql://postgres:postgres@localhost:5432/specter'),
  REDIS_URL: z
    .string()
    .url('REDIS_URL must be a valid Redis URL')
    .default('redis://localhost:6379'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  // AI Compiler Provider
  COMPILER_PROVIDER: z.enum(['agy', 'codex', 'api']).default('agy'),
  COMPILER_API_MODEL: z.string().trim().default(''),
  COMPILER_API_KEY: z.string().default(''),
  COMPILER_API_BASE_URL: z
    .string()
    .url()
    .default('https://generativelanguage.googleapis.com/v1beta'),
  COMPILER_API_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),
  COMPILER_API_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(100).max(30000).default(1000),
  COMPILER_API_RETRY_MAX_DELAY_MS: z.coerce.number().int().min(100).max(120000).default(10000),
  COMPILER_RATE_LIMIT_RETRY_DELAY_MS: z.coerce
    .number()
    .int()
    .min(120000)
    .max(86400000)
    .default(120000),
  EVALS_LIVE_MODELS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  AGY_CLI_PATH: z.string().min(1).default('agy'),
  CODEX_CLI_PATH: z.string().min(1).default('codex'),
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

  SEMANTIC_REVIEW_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  SEMANTIC_REVIEW_THRESHOLD: z.coerce.number().int().min(0).max(10).default(4),
  EXTRACTION_ACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  EXTRACTION_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(250),
  EXTRACTION_MAX_EVIDENCE: z.coerce.number().int().positive().default(200),
  EXTRACTION_EVIDENCE_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  CONFIGURATION_MAX_DECISIONS: z.coerce.number().int().min(1).max(30).default(6),
  CONFIGURATION_REVIEW_RESERVE_MS: z.coerce.number().int().positive().default(30000),
  COMPILER_MAX_OUTPUT_CHARS: z.coerce.number().int().min(1000).default(30000),
  COMPILER_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(8192),
  NOTIFICATION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(240000).default(30000),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  EXTRACTION_MAX_PAGES: z.coerce.number().int().positive().default(10),
  EXTRACTION_MAX_ACTIONS: z.coerce.number().int().positive().default(20),
  EXTRACTION_MAX_ITEMS: z.coerce.number().int().positive().default(500),
  ACQUISITION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  ACCESS_BLOCK_THRESHOLD: z.coerce.number().int().positive().default(2),
  ACCESS_BLOCK_COOLDOWN_MINUTES: z.coerce.number().int().positive().default(60),
  EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  COMPILATION_BUDGET_MS: z.coerce.number().int().positive().default(300000),
  COMPILATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  COMPILATION_QUEUE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  CONFIGURATION_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(30000),
  // Detailed prompts and model outputs may contain customer-provided text and page content.
  COMPILATION_DIAGNOSTICS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  COMPILATION_DIAGNOSTICS_MAX_CHARS: z.coerce.number().int().min(1000).max(100000).default(30000),
  HEALING_WINDOW_MS: z.coerce.number().int().positive().default(86400000),

  // Guardrails & Self-Healing
  MIN_CRON_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
  CONSECUTIVE_FAILURES_FOR_HEALING: z.coerce.number().int().min(1).default(2),
  MAX_HEALING_RETRIES: z.coerce.number().int().min(1).default(3),
  RETENTION_DAYS_UNCHANGED: z.coerce.number().int().min(1).default(14),

  // Notifications
  NOTIFICATION_PROVIDER: z.enum(['resend', 'console']).default('console'),
  RESEND_API_KEY: z.string().optional().default(''),
  NOTIFICATION_FROM_EMAIL: z.string().min(1).default('onboarding@resend.dev'),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_BOT_USERNAME: z.string().optional().default(''),

  // Encryption at Rest (AES-256-GCM)
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'ENCRYPTION_KEY must contain exactly 64 hexadecimal characters (32 bytes)'
    ),

  // Chrome Extension CORS Allow-list
  // Production: set to the exact extension ID (e.g. "abcdefghijklmnopabcdefghijklmnop")
  // Development/empty: all chrome-extension:// origins are allowed
  CHROME_EXTENSION_ID: z.string().optional().default(''),

  // Rate Limiting
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),

  // Authentication & Stateless JWT Cookies
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must contain at least 16 characters')
    .default('specter-dev-jwt-secret-change-in-production'),
  JWT_ACCESS_EXPIRES_SECONDS: z.coerce.number().int().min(60).default(900),
  JWT_REFRESH_EXPIRES_SECONDS: z.coerce.number().int().min(300).default(604800),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  FRONTEND_URL: z.string().min(1).default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().optional().default(''),

  // Supabase Object Storage (Screenshots & Visual Diffs)
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('specter-screenshots'),
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
    parsed.SEMANTIC_REVIEW_ENABLED &&
    parsed.CONFIGURATION_REVIEW_RESERVE_MS >= parsed.COMPILATION_BUDGET_MS
  )
    throw new Error(
      'Invalid environment configuration: CONFIGURATION_REVIEW_RESERVE_MS must be smaller than COMPILATION_BUDGET_MS.'
    );

  if (parsed.COMPILER_PROVIDER === 'api') {
    const missing: string[] = [];
    if (!parsed.COMPILER_API_MODEL) missing.push('COMPILER_API_MODEL');
    if (!parsed.COMPILER_API_KEY) missing.push('COMPILER_API_KEY');
    if (missing.length > 0) {
      throw new Error(
        `Invalid environment configuration:\n${missing.map((key) => `  - ${key}: Required when COMPILER_PROVIDER is set to "api"`).join('\n')}`
      );
    }
  }

  if (
    parsed.NOTIFICATION_PROVIDER === 'resend' &&
    !parsed.RESEND_API_KEY &&
    parsed.NODE_ENV !== 'test'
  ) {
    throw new Error(
      'Invalid environment configuration:\n  - RESEND_API_KEY: Required when NOTIFICATION_PROVIDER is set to "resend"'
    );
  }

  if (
    parsed.NODE_ENV === 'production' &&
    parsed.JWT_SECRET === 'specter-dev-jwt-secret-change-in-production'
  ) {
    throw new Error(
      'Invalid environment configuration:\n  - JWT_SECRET: In production, you must set a secure, unique JWT_SECRET (the default development secret cannot be used).'
    );
  }

  return parsed;
}

export const env: AppEnv = parseEnv(process.env);
