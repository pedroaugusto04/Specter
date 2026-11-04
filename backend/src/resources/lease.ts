/** Resource ownership is independent of queue, browser and Redis implementations. */
export interface ResourceLease {
  readonly signal: AbortSignal;
  assertOwned(): Promise<void>;
  release(): Promise<void>;
}
export interface ILeaseStore {
  tryAcquire(key: string, ttlMs: number): Promise<ResourceLease | null>;
}
export const ResourceKey = {
  monitor: (id: string) => `specter:monitor:${id}`,
  browser: (slot: number) => `specter:browser-slot:${slot}`,
} as const;
