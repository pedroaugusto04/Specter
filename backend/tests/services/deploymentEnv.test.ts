import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const tuning = {
  ACQUISITION_MAX_ATTEMPTS: '2',
  CONFIGURATION_MAX_DECISIONS: '5',
  CONFIGURATION_MAX_INPUT_CHARS: '24000',
  CONFIGURATION_REVIEW_RESERVE_MS: '15000',
  COMPILER_MAX_OUTPUT_CHARS: '24000',
  COMPILER_MAX_OUTPUT_TOKENS: '6000',
  ACCESS_BLOCK_THRESHOLD: '3',
  ACCESS_BLOCK_COOLDOWN_MINUTES: '30',
  RECOVERY_WINDOW_MS: '172800000',
  MAX_RECOVERY_ATTEMPTS: '4',
  EVALS_LIVE_MODELS_ENABLED: 'true',
  HTTP_MAX_RESPONSE_BYTES: '2000000',
  RATE_LIMIT_PROBE_MAX: '8',
};
describe('Environment configuration', () => {
  it('uses documented defaults and rejects invalid tuning values', () => {
    expect(parseEnv({ ENCRYPTION_KEY: 'a'.repeat(64), NODE_ENV: 'test' })).toMatchObject({
      ACQUISITION_MAX_ATTEMPTS: 5,
      ACCESS_BLOCK_THRESHOLD: 2,
      ACCESS_BLOCK_COOLDOWN_MINUTES: 60,
      EVALS_LIVE_MODELS_ENABLED: false,
      HTTP_MAX_RESPONSE_BYTES: 10485760,
      RATE_LIMIT_PROBE_MAX: 10,
    });
    expect(
      parseEnv({
        ENCRYPTION_KEY: 'a'.repeat(64),
        NODE_ENV: 'test',
        EVALS_LIVE_MODELS_ENABLED: 'true',
      }).EVALS_LIVE_MODELS_ENABLED
    ).toBe(true);
    for (const key of Object.keys(tuning)) {
      for (const invalid of ['0', '-1', '1.5', 'invalid'])
        expect(() =>
          parseEnv({ ENCRYPTION_KEY: 'a'.repeat(64), NODE_ENV: 'test', [key]: invalid })
        ).toThrow(key);
    }
  });
  it('enforces the 15-minute cron floor in runtime configuration', () => {
    const base = { ENCRYPTION_KEY: 'a'.repeat(64), NODE_ENV: 'test' };
    expect(parseEnv({ ...base, MIN_CRON_INTERVAL_MINUTES: '15' }).MIN_CRON_INTERVAL_MINUTES).toBe(
      15
    );
    expect(() => parseEnv({ ...base, MIN_CRON_INTERVAL_MINUTES: '14' })).toThrow(
      'MIN_CRON_INTERVAL_MINUTES'
    );
  });
  it('requires a valid encryption key in every environment', () => {
    expect(() =>
      parseEnv({ NODE_ENV: 'production', JWT_SECRET: 'valid-production-jwt-secret' })
    ).toThrow('ENCRYPTION_KEY');
    for (const invalid of ['', 'short', 'g'.repeat(64)])
      expect(() => parseEnv({ NODE_ENV: 'test', ENCRYPTION_KEY: invalid })).toThrow(
        'ENCRYPTION_KEY'
      );
    expect(
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'valid-production-jwt-secret',
        ENCRYPTION_KEY: 'a'.repeat(64),
      }).ENCRYPTION_KEY
    ).toBe('a'.repeat(64));
  });
  it('requires Gemini model and key only when the API provider is selected', () => {
    const base = { NODE_ENV: 'test', ENCRYPTION_KEY: 'a'.repeat(64) };
    expect(() => parseEnv({ ...base, COMPILER_PROVIDER: 'api' })).toThrow('COMPILER_API_MODEL');
    expect(() =>
      parseEnv({ ...base, COMPILER_PROVIDER: 'api', COMPILER_API_MODEL: 'gemini-test-model' })
    ).toThrow('COMPILER_API_KEY');
    expect(
      parseEnv({
        ...base,
        COMPILER_PROVIDER: 'api',
        COMPILER_API_MODEL: 'gemini-test-model',
        COMPILER_API_KEY: 'test-secret',
      }).COMPILER_PROVIDER
    ).toBe('api');
    expect(parseEnv(base).COMPILER_PROVIDER).toBe('agy');
  });
  it('blocks full-access Codex sandboxes in production while allowing read-only', () => {
    const prodBase = {
      NODE_ENV: 'production',
      JWT_SECRET: 'valid-production-jwt-secret',
      ENCRYPTION_KEY: 'a'.repeat(64),
      COMPILER_PROVIDER: 'codex',
    };
    expect(() =>
      parseEnv({ ...prodBase, COMPILER_CODEX_SANDBOX: 'danger-full-access' })
    ).toThrow('COMPILER_CODEX_SANDBOX');
    expect(() =>
      parseEnv({
        ...prodBase,
        COMPILER_CODEX_SANDBOX: 'dangerously-bypass-approvals-and-sandbox',
      })
    ).toThrow('COMPILER_CODEX_SANDBOX');
    expect(
      parseEnv({ ...prodBase, COMPILER_CODEX_SANDBOX: 'read-only' }).COMPILER_CODEX_SANDBOX
    ).toBe('read-only');
  });
  it('preserves custom values through the deployment environment generator', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'specter-env-'));
    try {
      const file = join(directory, 'backend.env');
      await promisify(execFile)(
        'bash',
        [resolve('../scripts/deploy/generate-backend-env.sh'), file],
        {
          env: {
            ...process.env,
            ...tuning,
            POSTGRES_APP_PASSWORD: 'app-password-for-test-only',
            ENCRYPTION_KEY: 'a'.repeat(64),
            COMPILER_PROVIDER: 'api',
            COMPILER_API_MODEL: 'gemini-test-model',
            COMPILER_API_KEY: 'test-secret',
          },
        }
      );
      const generated = await readFile(file, 'utf8');
      for (const [key, value] of Object.entries(tuning))
        expect(generated).toContain(`${key}=${value}\n`);
      expect(generated).toContain(`ENCRYPTION_KEY=${'a'.repeat(64)}\n`);
      expect(generated).toContain('COMPILER_PROVIDER=api\n');
      expect(generated).toContain('COMPILER_API_MODEL=gemini-test-model\n');
      expect(generated).toContain('COMPILER_API_KEY=test-secret\n');
      expect(generated).toContain('POSTGRES_APP_PASSWORD=app-password-for-test-only\n');
      expect(generated).toContain(
        'DATABASE_URL=postgresql://specter_app:app-password-for-test-only@postgres:5432/specter\n'
      );
      expect(generated).toContain(
        'MIGRATION_DATABASE_URL=postgresql://postgres:postgres@postgres:5432/specter\n'
      );
      const workflow = await readFile('../.github/workflows/deploy-fullstack.yml', 'utf8');
      expect(workflow).toContain('secrets.ENCRYPTION_KEY');
      for (const example of ['../.env.example', '.env.example']) {
        const contents = await readFile(example, 'utf8');
        expect(contents).toContain('\nENCRYPTION_KEY=');
        expect(contents).toContain('\nEVALS_LIVE_MODELS_ENABLED=false');
      }
      for (const key of Object.keys(tuning)) expect(workflow).toContain(`vars.${key}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
