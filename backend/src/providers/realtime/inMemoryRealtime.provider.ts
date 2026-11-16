import { EventEmitter } from 'node:events';
import type {
  IRealtimeEventBus,
  RealtimeEvent,
  RealtimeEventHandler,
} from './realtime.interface.js';

export class InMemoryRealtimeEventBus implements IRealtimeEventBus {
  public readonly name = 'in-memory-realtime';
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  async publish(event: RealtimeEvent): Promise<void> {
    this.emitter.emit(`user:${event.userId}`, event);
  }

  async subscribe(userId: string, handler: RealtimeEventHandler): Promise<() => void> {
    const channel = `user:${userId}`;
    this.emitter.on(channel, handler);
    return () => {
      this.emitter.off(channel, handler);
    };
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}
