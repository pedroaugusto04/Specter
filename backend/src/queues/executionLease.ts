import { AsyncLocalStorage } from 'node:async_hooks';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { RedisLeaseStore } from '../resources/redisLeaseStore.js';
import { ResourceKey } from '../resources/lease.js';

const executionContext = new AsyncLocalStorage<() => Promise<void>>();
export async function assertExecutionLease(): Promise<void> {
  await executionContext.getStore()?.();
}
/** Monitor ownership only. Browser capacity is reserved by the browser adapter. */
export class ExecutionLease {
  private readonly redis = new Redis(env.REDIS_URL);
  private readonly store = new RedisLeaseStore(this.redis);
  async run<T>(
    jobId: string,
    action: () => Promise<T>,
    shouldSkip?: () => Promise<boolean>
  ): Promise<T | null> {
    const ttl = env.COMPILATION_BUDGET_MS + env.EXTRACTION_TIMEOUT_MS + env.COMPILER_TIMEOUT_MS;
    const lease = await this.store.tryAcquire(ResourceKey.monitor(jobId), ttl);
    if (!lease) throw new Error('Monitor execution is already in progress.');
    try {
      if (await shouldSkip?.()) return null;
      return await executionContext.run(() => lease.assertOwned(), action);
    } finally {
      await lease.release();
    }
  }
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
