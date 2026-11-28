import { fixturePlan } from '../helpers/extractionFixtures.js';
import { spawn, type SpawnOptions } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  CompilerApiRequestError,
  CompilerTimeoutError,
  CompilerValidationError,
} from '../../src/errors/domainErrors.js';
import { defaultCliErrorClassifier } from '../../src/providers/compilers/cliErrorClassifier.js';
import { AgyCliCompilerProvider } from '../../src/providers/compilers/agyCliCompiler.provider.js';
import { reconcilePendingCompilations, reconcileRepeatableJobs } from '../../src/queues/reconciler.js';
import { RetentionService } from '../../src/services/retentionService.js';
import { InMemoryJobRepository } from '../helpers/testDoubles.js';
describe('Subprocess Safety (Dead Man Switch), Reconciler & Retention Pruning', () => {
  it('preserves delayed compilation retries when reconciling pending jobs on startup', async () => {
    const queue = { getJobs: async () => [{ data: { jobId: 'delayed' } }] };
    const enqueued: string[] = [];
    await reconcilePendingCompilations(queue as never, ['delayed', 'missing'], async (id) => {
      enqueued.push(id);
    });
    expect(enqueued).toEqual(['missing']);
  });
  it('reactively resolves when CLI writes extractor.json and cleans up temp directory', async () => {
    const tempBaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scraper-test-ok-'));
    const jobId = 'job-reactive-123';
    const provider = new AgyCliCompilerProvider({
      tempBaseDir,
      timeoutMs: 10000,
      cliCommand: process.execPath,
      cliArgsBuilder: (_promptFile, outputFile) => [
        '-e',
        `setTimeout(() => {
          const fs = require('fs');
          fs.writeFileSync(${JSON.stringify(outputFile)}, ${JSON.stringify(JSON.stringify(fixturePlan({ fields: { headline: { sources: [{ kind: 'dom', selector: 'h1', attribute: 'text' }], type: 'string', required: true, normalizeVolatileText: false, locale: 'en-US' } } })))});
        }, 50);
        setTimeout(() => {}, 10000);`,
      ],
      spawnFn: spawn,
    });
    const schema = await provider.generate({
      task: 'configure',
      timeoutMs: 10000,
      jobId,
      evidence: '<html><body><h1>Hello</h1></body></html>',
      instructions: 'Get headline',
    });
    expect(schema).toEqual(
      fixturePlan({
        mode: 'single',
        readySelector: 'body',
        scope: 'page',
        identityFields: [],
        triggerRules: [],
        triggerMatchMode: 'all',
        fields: {
          headline: {
            sources: [{ kind: 'dom', selector: 'h1', attribute: 'text' }],
            type: 'string',
            required: true,
            normalizeVolatileText: false,
            locale: 'en-US',
          },
        },
      })
    );
    // Temp job directory must be cleaned up after completion
    expect(await fs.readdir(tempBaseDir)).toEqual([]);
    await fs.rm(tempBaseDir, { recursive: true, force: true });
  });
  it('runs AGY in read-only plan mode with isolated settings and parses JSON from stdout', async () => {
    const tempBaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scraper-test-agy-stdout-'));
    const executable = path.join(tempBaseDir, 'fake-agy.cjs');
    const expected = fixturePlan();
    await fs.writeFile(
      executable,
      `const args = process.argv.slice(2);
      if (args[0] !== '--print') process.exit(11);
      if (!args.includes('--mode') || args[args.indexOf('--mode') + 1] !== 'plan') process.exit(12);
      if (!args.includes('--sandbox') || !args.includes('--disable-slash-commands')) process.exit(13);
      if (!args.includes('--settings') || args[args.indexOf('--settings') + 1] !== '{}') process.exit(14);
      process.stdout.write(${JSON.stringify(JSON.stringify(expected))});
      process.exit(0);`
    );
    const workDir = path.join(tempBaseDir, 'work');
    const provider = new AgyCliCompilerProvider({
      tempBaseDir: workDir,
      timeoutMs: 10000,
      model: 'plan-model',
      spawnFn: (_command: string, args: readonly string[], options: SpawnOptions) =>
        spawn(process.execPath, [executable, ...args], options),
    });
    const result = await provider.generate({
      task: 'configure',
      timeoutMs: 10000,
      jobId: 'agy-hardened-1',
      evidence: '<html><body><h1>Hello</h1></body></html>',
      instructions: 'Get headline',
    });
    expect(result).toEqual(expected);
    expect(await fs.readdir(workDir)).toEqual([]);
    await fs.rm(tempBaseDir, { recursive: true, force: true });
  });
  it('enforces dead-man switch timeout, kills hanging subprocess with SIGKILL, and cleans up temp files', async () => {
    const tempBaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scraper-test-timeout-'));
    const jobId = 'job-hang-999';
    const provider = new AgyCliCompilerProvider({
      tempBaseDir,
      timeoutMs: 300, // 300ms dead-man switch for fast test execution
      cliCommand: process.execPath,
      cliArgsBuilder: () => ['-e', 'setInterval(() => {}, 1000);'],
      spawnFn: spawn,
    });
    await expect(
      provider.generate({
        task: 'configure',
        timeoutMs: 10000,
        jobId,
        evidence: '<html><body><h1>Hanging</h1></body></html>',
        instructions: 'Hang test',
      })
    ).rejects.toThrow(CompilerTimeoutError);
    // Verify temp directory was cleaned up even after timeout
    expect(await fs.readdir(tempBaseDir)).toEqual([]);
    await fs.rm(tempBaseDir, { recursive: true, force: true });
  });
  it('detects usage and rate limits in CLI stderr and throws CompilerApiRequestError(429)', async () => {
    const tempBaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scraper-test-ratelimit-'));
    const jobId = 'job-ratelimit-1';
    const provider = new AgyCliCompilerProvider({
      tempBaseDir,
      timeoutMs: 5000,
      cliCommand: process.execPath,
      cliArgsBuilder: () => [
        '-e',
        'console.error("ERROR: You’ve hit your usage limit. Upgrade to Pro or try again at 6:10 PM."); process.exit(1);',
      ],
      spawnFn: spawn,
    });
    try {
      await provider.generate({
        task: 'configure',
        timeoutMs: 5000,
        jobId,
        evidence: '<html><body><h1>Rate limit</h1></body></html>',
        instructions: 'Test',
      });
      expect.fail('Should have thrown CompilerApiRequestError');
    } catch (err) {
      expect(err).toBeInstanceOf(CompilerApiRequestError);
      expect((err as CompilerApiRequestError).statusCode).toBe(429);
      expect((err as CompilerApiRequestError).isRetryable).toBe(true);
    }
    expect(await fs.readdir(tempBaseDir)).toEqual([]);
    await fs.rm(tempBaseDir, { recursive: true, force: true });
  });
  it('includes captured stderr in CompilerValidationError when process fails without writing extractor.json', async () => {
    const tempBaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scraper-test-stderr-'));
    const jobId = 'job-stderr-1';
    const provider = new AgyCliCompilerProvider({
      tempBaseDir,
      timeoutMs: 5000,
      cliCommand: process.execPath,
      cliArgsBuilder: () => [
        '-e',
        'console.error("SyntaxError: Unexpected token in configuration"); process.exit(1);',
      ],
      spawnFn: spawn,
    });
    try {
      await provider.generate({
        task: 'configure',
        timeoutMs: 5000,
        jobId,
        evidence: '<html><body><h1>Failure</h1></body></html>',
        instructions: 'Test',
      });
      expect.fail('Should have thrown CompilerValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(CompilerValidationError);
      expect((err as CompilerValidationError).message).toContain('SyntaxError: Unexpected token');
    }
    expect(await fs.readdir(tempBaseDir)).toEqual([]);
    await fs.rm(tempBaseDir, { recursive: true, force: true });
  });
  it('correctly classifies structured JSON errors and authentication failures from CLI', () => {
    const rateLimitJson = defaultCliErrorClassifier({
      providerName: 'codex',
      exitCode: 1,
      stderr: '{"type":"error","message":"You’ve hit your usage limit. Try again at 6:10 PM."}',
    });
    expect(rateLimitJson).toBeInstanceOf(CompilerApiRequestError);
    expect((rateLimitJson as CompilerApiRequestError).statusCode).toBe(429);

    const authError = defaultCliErrorClassifier({
      providerName: 'codex',
      exitCode: 1,
      stderr: 'Error: invalid_api_key or permission_denied for requested model',
    });
    expect(authError).toBeInstanceOf(CompilerApiRequestError);
    expect((authError as CompilerApiRequestError).statusCode).toBe(401);
  });
  it('reconciles repeatable jobs by removing Redis orphans and scheduling missing active DB jobs', async () => {
    const removedKeys: string[] = [];
    const addedJobs: Array<{
      name: string;
      data: unknown;
      opts: unknown;
    }> = [];
    const fakeQueue = {
      async getRepeatableJobs() {
        return [
          {
            key: 'scrape-job:job-cron-active-1:::*/15 * * * *',
            name: 'scrape-job',
            id: 'job-cron-active-1',
            endDate: null,
            tz: null,
            pattern: '*/15 * * * *',
            next: Date.now() + 60000,
          },
          {
            key: 'scrape-job:job-cron-orphan-99:::0 * * * *',
            name: 'scrape-job',
            id: 'job-cron-orphan-99',
            endDate: null,
            tz: null,
            pattern: '0 * * * *',
            next: Date.now() + 60000,
          },
        ];
      },
      async removeRepeatableByKey(key: string) {
        removedKeys.push(key);
        return true;
      },
      async add(name: string, data: unknown, opts: unknown) {
        addedJobs.push({ name, data, opts });
        return {} as never;
      },
    };
    const result = await reconcileRepeatableJobs(fakeQueue, [
      { id: 'active-1', cronExpression: '*/15 * * * *' },
      { id: 'active-2', cronExpression: '0 */6 * * *' },
    ]);
    expect(result.removedOrphanKeys).toEqual(['scrape-job:job-cron-orphan-99:::0 * * * *']);
    expect(result.scheduledMissingJobIds).toEqual(['active-2']);
    expect(addedJobs).toHaveLength(1);
  });
  it('replaces schedules when their timezone changes', async () => {
    const removed: string[] = [];
    const added: unknown[] = [];
    const queue = {
      async getRepeatableJobs() {
        return [
          {
            key: 'old',
            id: 'job-cron-1',
            name: 'scrape-job',
            endDate: null,
            tz: 'UTC',
            pattern: '0 9 * * *',
            next: Date.now(),
          },
        ];
      },
      async removeRepeatableByKey(key: string) {
        removed.push(key);
        return true;
      },
      async add(_name: string, _data: unknown, options: unknown) {
        added.push(options);
        return {} as never;
      },
    };
    await reconcileRepeatableJobs(queue, [
      { id: '1', cronExpression: '0 9 * * *', timezone: 'America/Sao_Paulo' },
    ]);
    expect(removed).toEqual(['old']);
    expect(added).toEqual([
      expect.objectContaining({ repeat: { pattern: '0 9 * * *', tz: 'America/Sao_Paulo' } }),
    ]);
  });
  it('prunes only unchanged snapshots (hasChanges = NO) older than the retention window', async () => {
    const repository = new InMemoryJobRepository();
    const retentionService = new RetentionService(repository, 14);
    const job = await repository.createJob({
      url: 'https://example.com',
      userPrompt: 'Monitor title',
      notificationEmail: 'user@example.com',
      cronExpression: '0 */6 * * *',
    });
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    // 1. Old INITIAL snapshot -> must be kept
    await repository.createRun({
      jobId: job.id,
      hasChanges: 'INITIAL',
      status: 'SUCCESS',
      executedAt: twentyDaysAgo,
    });
    // 2. Old YES snapshot -> must be kept
    await repository.createRun({
      jobId: job.id,
      hasChanges: 'YES',
      status: 'SUCCESS',
      executedAt: twentyDaysAgo,
    });
    // 3. Old NO snapshot (20 days old) -> must be pruned
    await repository.createRun({
      jobId: job.id,
      hasChanges: 'NO',
      status: 'SUCCESS',
      executedAt: twentyDaysAgo,
    });
    // 4. Recent NO snapshot (2 days old) -> must be kept
    await repository.createRun({
      jobId: job.id,
      hasChanges: 'NO',
      status: 'SUCCESS',
      executedAt: twoDaysAgo,
    });
    const { deletedCount } = await retentionService.pruneUnchangedSnapshots();
    expect(deletedCount).toBe(1);
    const remainingRuns = await repository.findRunsByJobId(job.id);
    expect(remainingRuns).toHaveLength(3);
  });
});
