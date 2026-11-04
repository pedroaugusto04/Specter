import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../frontend/src', import.meta.url)) } },
  test: {
    globals: true,
    env: { ENCRYPTION_KEY: 'a'.repeat(64) },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
  },
});
