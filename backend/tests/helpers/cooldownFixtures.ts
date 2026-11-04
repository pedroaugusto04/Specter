import type { IAccessCooldownStore } from '../../src/acquisition/cooldown.js';
export class InMemoryAccessCooldownStore implements IAccessCooldownStore {
  private readonly entries = new Map<
    string,
    { count: number; until: number | null; expires: number }
  >();
  async get(key: string): Promise<number | null> {
    const entry = this.entries.get(key);
    if (entry && entry.expires <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry?.until ?? null;
  }
  async blocked(
    key: string,
    threshold: number,
    durationMs: number,
    now: number,
    retentionMs: number
  ): Promise<number | null> {
    const previous = this.entries.get(key);
    const count = previous && previous.expires > now ? previous.count + 1 : 1;
    const until = count >= threshold ? now + durationMs : null;
    this.entries.set(key, { count, until, expires: until ?? now + retentionMs });
    return until;
  }
  async clear(key: string): Promise<void> {
    this.entries.delete(key);
  }
}
