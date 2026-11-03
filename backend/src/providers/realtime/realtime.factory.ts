import { env } from '../../config/env.js';
import { getRedisConnectionOptions } from '../../queues/queues.js';
import { InMemoryRealtimeEventBus } from './inMemoryRealtime.provider.js';
import type { IRealtimeEventBus } from './realtime.interface.js';
import { RedisRealtimeEventBus } from './redisRealtime.provider.js';
import type { RedisOptions } from 'ioredis';

export function createRealtimeEventBus(): IRealtimeEventBus {
  if (env.NODE_ENV === 'test') {
    return new InMemoryRealtimeEventBus();
  }
  return new RedisRealtimeEventBus(getRedisConnectionOptions() as RedisOptions);
}
