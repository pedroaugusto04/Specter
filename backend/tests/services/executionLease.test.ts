import { beforeEach, describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import { ExecutionLease, assertExecutionLease } from '../../src/queues/executionLease.js';
import { RedisLeaseStore } from '../../src/resources/redisLeaseStore.js';

const values = new Map<string, string>();
const fakeRedis = {
  async set(key: string, value: string) {
    if (values.has(key)) return null;
    values.set(key, value);
    return 'OK';
  },
  async mget(...keys: string[]) {
    return keys.map((key) => values.get(key) ?? null);
  },
  async eval(script: string, _count: number, key: string, token: string) {
    if (values.get(key) !== token) return 0;
    if (script.includes("'del'")) values.delete(key);
    return 1;
  },
} as unknown as Redis;

function createLease() {
  return new ExecutionLease(new RedisLeaseStore(fakeRedis));
}

beforeEach(() => values.clear());

describe('Shared worker leases', () => {
  it('prevents overlapping compilation and scraping for the same monitor', async () => {
    const lease = createLease();
    await lease.run('one', async () => {
      await expect(lease.run('one', async () => undefined)).rejects.toThrow('already in progress');
      await assertExecutionLease();
    });
    expect(values.size).toBe(0);
  });

  it('rejects stale results after losing ownership', async () => {
    await createLease().run('one', async () => {
      values.delete('specter:monitor:one');
      await expect(assertExecutionLease()).rejects.toThrow('lease was lost');
    });
    expect(values.size).toBe(0);
  });

  it('releases monitor ownership even when execution fails', async () => {
    await expect(
      createLease().run('one', async () => {
        throw new Error('Failure');
      })
    ).rejects.toThrow('Failure');
    expect(values.size).toBe(0);
  });
});
