import type { RealtimeEventDto as RealtimeEvent } from '@specter/contracts';
export type { RealtimeEventDto as RealtimeEvent, RealtimeEventType } from '@specter/contracts';

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

export interface IRealtimeEventBus {
  readonly name: string;
  publish(event: RealtimeEvent): Promise<void>;
  subscribe(userId: string, handler: RealtimeEventHandler): Promise<() => void>;
  close(): Promise<void>;
}
