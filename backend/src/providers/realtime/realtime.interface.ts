import type { RealtimeEventDto as RealtimeEvent } from '@specter/contracts';
export type { RealtimeEventDto as RealtimeEvent, RealtimeEventType } from '@specter/contracts';

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

export interface IRealtimeEventBus {
  readonly name: string;
  publish(event: RealtimeEvent): Promise<void>;
  /** Resolves when subscribed; onDisconnect tells callers to close and resynchronize the stream. */
  subscribe(
    userId: string,
    handler: RealtimeEventHandler,
    onDisconnect?: () => void
  ): Promise<() => void>;
  close(): Promise<void>;
}
