import { Redis, type RedisOptions } from 'ioredis';
import { logger } from '../../utils/logger.js';
import type {
  IRealtimeEventBus,
  RealtimeEvent,
  RealtimeEventHandler,
} from './realtime.interface.js';

const CHANNEL_PREFIX = 'specter:events:';

export class RedisRealtimeEventBus implements IRealtimeEventBus {
  public readonly name = 'redis-realtime';
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly listeners = new Map<string, Set<RealtimeEventHandler>>();
  private isClosed = false;

  constructor(options: RedisOptions) {
    this.publisher = new Redis({
      ...options,
      lazyConnect: false,
    });
    this.subscriber = new Redis({
      ...options,
      lazyConnect: false,
    });

    this.subscriber.on('message', (channel: string, message: string) => {
      try {
        const userId = channel.replace(CHANNEL_PREFIX, '');
        const handlers = this.listeners.get(userId);
        if (handlers && handlers.size > 0) {
          const event = JSON.parse(message) as RealtimeEvent;
          for (const handler of handlers) {
            try {
              handler(event);
            } catch (handlerErr) {
              logger.error('Error in realtime event handler callback', {
                userId,
                eventType: event.type,
                errorMessage: handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
              });
            }
          }
        }
      } catch (parseErr) {
        logger.error('Failed to parse realtime event payload from Redis', {
          channel,
          errorMessage: parseErr instanceof Error ? parseErr.message : String(parseErr),
        });
      }
    });

    this.publisher.on('error', (err) => {
      logger.warn('RedisRealtimeEventBus publisher connection warning', {
        errorMessage: err.message,
      });
    });

    this.subscriber.on('error', (err) => {
      logger.warn('RedisRealtimeEventBus subscriber connection warning', {
        errorMessage: err.message,
      });
    });
  }

  async publish(event: RealtimeEvent): Promise<void> {
    if (this.isClosed) return;
    try {
      const channel = `${CHANNEL_PREFIX}${event.userId}`;
      await this.publisher.publish(channel, JSON.stringify(event));
    } catch (err) {
      logger.warn('Failed to publish realtime event to Redis channel', {
        userId: event.userId,
        type: event.type,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  subscribe(userId: string, handler: RealtimeEventHandler): () => void {
    if (this.isClosed) return () => {};

    let userHandlers = this.listeners.get(userId);
    if (!userHandlers) {
      userHandlers = new Set();
      this.listeners.set(userId, userHandlers);
      void this.subscriber.subscribe(`${CHANNEL_PREFIX}${userId}`).catch((err) => {
        logger.warn('Failed to subscribe to Redis realtime channel', {
          userId,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      });
    }
    userHandlers.add(handler);

    return () => {
      const current = this.listeners.get(userId);
      if (current) {
        current.delete(handler);
        if (current.size === 0) {
          this.listeners.delete(userId);
          if (!this.isClosed) {
            void this.subscriber.unsubscribe(`${CHANNEL_PREFIX}${userId}`).catch(() => {});
          }
        }
      }
    };
  }

  async close(): Promise<void> {
    this.isClosed = true;
    this.listeners.clear();
    await Promise.allSettled([this.subscriber.quit(), this.publisher.quit()]);
  }
}
