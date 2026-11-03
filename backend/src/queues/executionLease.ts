import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

const executionContext = new AsyncLocalStorage<() => Promise<void>>();
export async function assertExecutionLease(): Promise<void> {
  await executionContext.getStore()?.();
}

/** One monitor operation and one shared browser slot per worker execution. */
export class ExecutionLease {
  private readonly redis = new Redis(env.REDIS_URL);
  async run<T>(jobId: string, action: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const ttl = env.COMPILATION_BUDGET_MS + env.EXTRACTION_TIMEOUT_MS + env.COMPILER_TIMEOUT_MS;
    const keys = [`specter:monitor:${jobId}`];
    if (!(await this.redis.set(keys[0]!, token, 'PX', ttl, 'NX')))
      throw new Error('Monitor execution is already in progress.');
    const release = async () => {
      for (const key of keys)
        await this.redis.eval(
          "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) end return 0",
          1,
          key,
          token
        );
    };
    let renewal: ReturnType<typeof setInterval> | undefined;
    try {
      for (let slot = 0; slot < env.SCRAPER_CONCURRENCY; slot++) {
        const key = `specter:browser-slot:${slot}`;
        if (await this.redis.set(key, token, 'PX', ttl, 'NX')) {
          keys.push(key);
          break;
        }
      }
      if (keys.length < 2)
        throw new Error('All extraction capacity is currently in use. Retry later.');
      renewal = setInterval(
        () => {
          for (const key of keys)
            void this.redis
              .eval(
                "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],ARGV[2]) end return 0",
                1,
                key,
                token,
                ttl
              )
              .catch(() => {});
        },
        Math.floor(ttl / 3)
      );
      return await executionContext.run(async () => {
        const values = await this.redis.mget(...keys);
        if (values.some((value) => value !== token))
          throw new Error('Execution lease was lost. Discarding stale results.');
      }, action);
    } finally {
      if (renewal) clearInterval(renewal);
      await release();
    }
  }
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
