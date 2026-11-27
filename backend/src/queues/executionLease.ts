import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../config/env.js';
import { MonitorExecutionInProgressError } from '../errors/domainErrors.js';
import { ResourceKey, type ILeaseStore } from '../resources/lease.js';

const executionContext = new AsyncLocalStorage<() => Promise<void>>();

export async function assertExecutionLease(): Promise<void> {
  await executionContext.getStore()?.();
}

/** Monitor ownership only. Browser capacity is reserved by the browser adapter. */
export class ExecutionLease {
  constructor(private readonly store: ILeaseStore) {}

  async run<T>(jobId: string, action: () => Promise<T>): Promise<T> {
    const ttl = env.COMPILATION_BUDGET_MS + env.EXTRACTION_TIMEOUT_MS + env.COMPILER_TIMEOUT_MS;
    const lease = await this.store.tryAcquire(ResourceKey.monitor(jobId), ttl);
    if (!lease) throw new MonitorExecutionInProgressError();
    try {
      return await executionContext.run(() => lease.assertOwned(), action);
    } finally {
      await lease.release();
    }
  }
}
