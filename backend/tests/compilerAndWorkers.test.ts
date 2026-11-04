import { fixturePlan } from './helpers/extractionFixtures.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CompilerTimeoutError } from '../src/errors/domainErrors.js';
import { AgyCliCompilerProvider } from '../src/providers/compilers/agyCliCompiler.provider.js';
import { reconcileRepeatableJobs } from '../src/queues/reconciler.js';
import { RetentionService } from '../src/services/retentionService.js';
import { InMemoryJobRepository } from './helpers/testDoubles.js';
describe('Subprocess Safety (Dead Man Switch), Reconciler & Retention Pruning', () => {
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
      task: 'plan',
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
        task: 'plan',
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
