import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionLease, assertExecutionLease } from '../src/queues/executionLease.js';

const values = vi.hoisted(() => new Map<string, string>());
vi.mock('ioredis', () => ({
  Redis: class {
    async set(key: string, value: string) {
      if (values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    }
    async mget(...keys: string[]) {
      return keys.map((key) => values.get(key) ?? null);
    }
    async eval(script: string, _count: number, key: string, token: string) {
      if (values.get(key) !== token) return 0;
      if (script.includes("'del'")) values.delete(key);
      return 1;
    }
    async quit() {}
  },
}));
beforeEach(() => values.clear());
describe('Shared worker leases', () => {
  it('prevents overlapping compilation and scraping for the same monitor', async () => {
    const lease = new ExecutionLease();
    await lease.run('one', async () => {
      await expect(lease.run('one', async () => undefined)).rejects.toThrow('already in progress');
      await assertExecutionLease();
    });
    expect(values.size).toBe(0);
  });
  it('rejects stale results after losing ownership', async () => {
    await new ExecutionLease().run('one', async () => {
      values.delete('specter:monitor:one');
      await expect(assertExecutionLease()).rejects.toThrow('lease was lost');
    });
    expect(values.size).toBe(0);
  });
  it('releases slots even when execution fails', async () => {
    await expect(
      new ExecutionLease().run('one', async () => {
        throw new Error('Failure');
      })
    ).rejects.toThrow('Failure');
    expect(values.size).toBe(0);
  });
});
