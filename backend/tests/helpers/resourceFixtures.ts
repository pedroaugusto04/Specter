import { vi } from 'vitest';
import type { ILeaseStore, ResourceLease } from '../../src/resources/lease.js';
export class InMemoryLeaseStore implements ILeaseStore {
  readonly held = new Map<string, AbortController>();
  async tryAcquire(key: string): Promise<ResourceLease | null> {
    if (this.held.has(key)) return null;
    const controller = new AbortController();
    this.held.set(key, controller);
    return {
      signal: controller.signal,
      assertOwned: async () => {},
      release: vi.fn(async () => {
        this.held.delete(key);
      }),
    };
  }
}
