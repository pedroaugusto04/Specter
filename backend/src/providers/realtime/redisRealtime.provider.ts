import { Redis, type RedisOptions } from 'ioredis';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
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
  private readonly subscriptions = new Map<string, Promise<void>>();
  private readonly disconnectHandlers = new Set<() => void>();
  private isClosed = false;

  constructor(options: RedisOptions) {
    const connectionOptions: RedisOptions = {
      ...options,
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: env.REALTIME_REDIS_TIMEOUT_MS,
      connectTimeout: env.REALTIME_REDIS_TIMEOUT_MS,
      autoResubscribe: false,
    };
    this.publisher = new Redis(connectionOptions);
    this.subscriber = new Redis(connectionOptions);

    this.subscriber.on('close', () => this.disconnectStreams());

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
    const channel = `${CHANNEL_PREFIX}${event.userId}`;
    try {
      await this.publisher.publish(channel, JSON.stringify(event));
    } catch (error) {
      this.disconnectStreams();
      throw error;
    }
  }

  async subscribe(
    userId: string,
    handler: RealtimeEventHandler,
    onDisconnect?: () => void
  ): Promise<() => void> {
    if (this.isClosed) throw new Error('Realtime event bus is closed');

    let handlers = this.listeners.get(userId);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(userId, handlers);
    }
    handlers.add(handler);
    if (onDisconnect) this.disconnectHandlers.add(onDisconnect);

    let subscription = this.subscriptions.get(userId);
    if (!subscription) {
      subscription = this.subscriber.subscribe(`${CHANNEL_PREFIX}${userId}`).then(() => undefined);
      this.subscriptions.set(userId, subscription);
    }

    try {
      await subscription;
      return this.createUnsubscribe(userId, handler, onDisconnect);
    } catch (err) {
      if (onDisconnect) this.disconnectHandlers.delete(onDisconnect);
      handlers.delete(handler);
      if (handlers.size === 0) this.listeners.delete(userId);
      if (this.subscriptions.get(userId) === subscription) this.subscriptions.delete(userId);
      logger.warn('Failed to subscribe to Redis realtime channel', {
        userId,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private disconnectStreams(): void {
    for (const disconnect of [...this.disconnectHandlers]) disconnect();
  }

  private createUnsubscribe(
    userId: string,
    handler: RealtimeEventHandler,
    onDisconnect?: () => void
  ): () => void {
    return () => {
      if (onDisconnect) this.disconnectHandlers.delete(onDisconnect);
      const current = this.listeners.get(userId);
      if (current) {
        current.delete(handler);
        if (current.size === 0) {
          this.listeners.delete(userId);
          this.subscriptions.delete(userId);
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
    this.subscriptions.clear();
    this.subscriber.disconnect();
    this.publisher.disconnect();
    this.disconnectHandlers.clear();
  }
}
