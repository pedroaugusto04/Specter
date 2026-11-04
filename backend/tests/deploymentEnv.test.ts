import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const tuning = {
  ACQUISITION_MAX_ATTEMPTS: '2',
  ACCESS_BLOCK_THRESHOLD: '3',
  ACCESS_BLOCK_COOLDOWN_MINUTES: '30',
};
describe('Acquisition environment configuration', () => {
  it('uses documented defaults and rejects invalid tuning values', () => {
    expect(parseEnv({ ENCRYPTION_KEY: 'a'.repeat(64), NODE_ENV: 'test' })).toMatchObject({
      ACQUISITION_MAX_ATTEMPTS: 3,
      ACCESS_BLOCK_THRESHOLD: 2,
      ACCESS_BLOCK_COOLDOWN_MINUTES: 60,
    });
    for (const key of Object.keys(tuning)) {
      for (const invalid of ['0', '-1', '1.5', 'invalid'])
        expect(() =>
          parseEnv({ ENCRYPTION_KEY: 'a'.repeat(64), NODE_ENV: 'test', [key]: invalid })
        ).toThrow(key);
    }
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
            ENCRYPTION_KEY: 'a'.repeat(64),
          },
        }
      );
      const generated = await readFile(file, 'utf8');
      for (const [key, value] of Object.entries(tuning))
        expect(generated).toContain(`${key}=${value}\n`);
      expect(generated).toContain(`ENCRYPTION_KEY=${'a'.repeat(64)}\n`);
      const workflow = await readFile('../.github/workflows/deploy-fullstack.yml', 'utf8');
      expect(workflow).toContain('secrets.ENCRYPTION_KEY');
      for (const example of ['../.env.example', '.env.example']) {
        const contents = await readFile(example, 'utf8');
        expect(contents).toContain('\nENCRYPTION_KEY=');
      }
      for (const key of Object.keys(tuning)) expect(workflow).toContain(`vars.${key}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
