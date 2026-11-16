import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisRealtimeEventBus } from '../../src/providers/realtime/redisRealtime.provider.js';
import { RealtimeService } from '../../src/services/realtimeService.js';

const state = vi.hoisted(() => ({
  clients: [] as Array<{
    emit(event: string): boolean;
    publish: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('ioredis', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    Redis: class extends EventEmitter {
      publish = vi.fn().mockResolvedValue(1);
      subscribe = vi.fn().mockResolvedValue(1);
      unsubscribe = vi.fn().mockResolvedValue(0);
      constructor() {
        super();
        state.clients.push(this);
      }
      disconnect() {
        this.emit('close');
      }
    },
  };
});

describe('Redis realtime recovery', () => {
  beforeEach(() => {
    state.clients.length = 0;
  });

  it('notifies all streams of a disconnect and establishes a fresh subscription on reconnect', async () => {
    const bus = new RedisRealtimeEventBus({});
    const subscriber = state.clients[1]!;
    const disconnected = vi.fn();
    let stop = () => {};
    stop = await bus.subscribe(
      'alice',
      () => {},
      () => {
        disconnected();
        stop();
      }
    );
    subscriber.emit('close');
    expect(disconnected).toHaveBeenCalledOnce();
    const stopAgain = await bus.subscribe('alice', () => {});
    expect(subscriber.subscribe).toHaveBeenCalledTimes(2);
    stopAgain();
    await bus.close();
  });

  it('lets domain operations finish when publication fails and closes streams for resynchronization', async () => {
    const bus = new RedisRealtimeEventBus({});
    const service = new RealtimeService(bus);
    const disconnected = vi.fn();
    const stop = await bus.subscribe('alice', () => {}, disconnected);
    state.clients[0]!.publish.mockRejectedValue(new Error('Command timed out'));
    await expect(service.notifyJobUpdated('alice', 'monitor', 'ACTIVE')).resolves.toBeUndefined();
    expect(disconnected).toHaveBeenCalledOnce();
    stop();
    await service.close();
  });

  it('rejects failed subscriptions and allows subsequent retries', async () => {
    const bus = new RedisRealtimeEventBus({});
    const subscriber = state.clients[1]!;
    subscriber.subscribe.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(bus.subscribe('alice', () => {})).rejects.toThrow('Redis unavailable');
    const stop = await bus.subscribe('alice', () => {});
    expect(subscriber.subscribe).toHaveBeenCalledTimes(2);
    stop();
    await bus.close();
  });
});
