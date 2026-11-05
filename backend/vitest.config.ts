import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../frontend/src', import.meta.url)) } },
  test: {
    globals: true,
    // Keep tests independent of provider credentials configured in the shell.
    env: {
      ENCRYPTION_KEY: 'a'.repeat(64),
      COMPILER_PROVIDER: 'agy',
      COMPILER_API_MODEL: '',
      COMPILER_API_KEY: '',
    },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
  },
});
