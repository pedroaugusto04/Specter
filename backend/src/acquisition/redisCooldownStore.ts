import type { Redis } from 'ioredis';
import type { IAccessCooldownStore } from './cooldown.js';
/** Atomic counter and deadline shared by workers; all keys expire. */
export class RedisAccessCooldownStore implements IAccessCooldownStore {
  constructor(private readonly redis: Redis) {}
  async get(key: string): Promise<number | null> {
    const value = await this.redis.hget(key, 'until');
    return value ? Number(value) : null;
  }
  async blocked(
    key: string,
    threshold: number,
    durationMs: number,
    now: number,
    retentionMs: number
  ): Promise<number | null> {
    const until = Number(
      await this.redis.eval(
        `
      local count = redis.call('hincrby', KEYS[1], 'count', 1)
      redis.call('pexpire', KEYS[1], ARGV[4])
      if count >= tonumber(ARGV[1]) then
        local untilTime = tonumber(ARGV[3]) + tonumber(ARGV[2])
        redis.call('hset', KEYS[1], 'until', untilTime)
        redis.call('pexpire', KEYS[1], ARGV[2])
        return untilTime
      end
      return 0
    `,
        1,
        key,
        threshold,
        durationMs,
        now,
        retentionMs
      )
    );
    return until || null;
  }
  async clear(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
