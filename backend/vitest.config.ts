import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../frontend/src', import.meta.url)) } },
  test: {
    globals: true,
    // Keep tests independent of provider credentials and deployment tuning configured in the shell/.env.
    env: {
      ACQUISITION_MAX_ATTEMPTS: '5',
      MIN_CRON_INTERVAL_MINUTES: '15',
      ENCRYPTION_KEY: 'a'.repeat(64),
      COMPILER_PROVIDER: 'agy',
      COMPILER_API_MODEL: '',
      COMPILER_API_KEY: '',
      EVALS_LIVE_MODELS_ENABLED: 'false',
      NOTIFICATION_PROVIDER: 'console',
      RESEND_API_KEY: '',
      TELEGRAM_BOT_TOKEN: '',
      SCRAPERAPI_KEY: '',
      SCRAPINGBEE_API_KEY: '',
      CRAWLBASE_TOKEN: '',
      ZENROWS_API_KEY: '',
      DECODO_API_KEY: '',
      HTTP_PROXY: '',
      HTTP_FALLBACK_PROXY: '',
    },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
  },
});
