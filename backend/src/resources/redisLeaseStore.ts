import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { ResourceLeaseLostError } from '../errors/domainErrors.js';
import type { ILeaseStore, ResourceLease } from './lease.js';

const RedisLeaseScript = {
  renew:
    "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],ARGV[2]) end return 0",
  release:
    "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) end return 0",
} as const;
const RENEWAL_FRACTION = 3;

/** Token ownership and renewal are shared by monitor locks and browser permits. */
export class RedisLeaseStore implements ILeaseStore {
  constructor(private readonly redis: Redis) {}
  async tryAcquire(key: string, ttlMs: number): Promise<ResourceLease | null> {
    const token = randomUUID();
    if (!(await this.redis.set(key, token, 'PX', ttlMs, 'NX'))) return null;
    const controller = new AbortController();
    let released = false;
    let releasePromise: Promise<void> | undefined;
    const lose = () => {
      clearInterval(renewal);
      controller.abort(new ResourceLeaseLostError());
    };
    const renewal = setInterval(
      () => {
        void this.redis
          .eval(RedisLeaseScript.renew, 1, key, token, ttlMs)
          .then((result) => {
            if (!result && !released) lose();
          })
          .catch(() => {
            if (!released) lose();
          });
      },
      Math.max(1, Math.floor(ttlMs / RENEWAL_FRACTION))
    );
    renewal.unref();
    return {
      signal: controller.signal,
      assertOwned: async () => {
        if (released || controller.signal.aborted || (await this.redis.mget(key))[0] !== token) {
          lose();
          throw new ResourceLeaseLostError();
        }
      },
      release: () => {
        releasePromise ??= (async () => {
          released = true;
          clearInterval(renewal);
          await this.redis.eval(RedisLeaseScript.release, 1, key, token);
        })();
        return releasePromise;
      },
    };
  }
}
