import { env } from '../config/env.js';
import type { ExecutionContext } from '../extraction/contracts.js';
import { BrowserCapacityError } from '../errors/domainErrors.js';
import { ResourceKey, type ILeaseStore, type ResourceLease } from './lease.js';

export interface IBrowserCapacity {
  acquire(context: ExecutionContext): Promise<ResourceLease>;
}
export class BrowserCapacity implements IBrowserCapacity {
  constructor(
    private readonly store: ILeaseStore,
    private readonly limit = env.SCRAPER_CONCURRENCY,
    private readonly ttlMs = env.EXTRACTION_TIMEOUT_MS + env.PLAYWRIGHT_TIMEOUT_MS
  ) {}
  async acquire(context: ExecutionContext): Promise<ResourceLease> {
    context.check();
    for (let slot = 0; slot < this.limit; slot++) {
      const lease = await this.store.tryAcquire(ResourceKey.browser(slot), this.ttlMs);
      if (!lease) {
        context.check();
        continue;
      }
      try {
        context.check();
        return lease;
      } catch (error) {
        await lease.release();
        throw error;
      }
    }
    throw new BrowserCapacityError();
  }
}
