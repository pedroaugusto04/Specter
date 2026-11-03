export type RealtimeEventType = 'JOB_CREATED' | 'JOB_UPDATED' | 'JOB_DELETED' | 'JOB_RUN_COMPLETED';

export interface RealtimeEvent {
  type: RealtimeEventType;
  userId: string;
  jobId: string;
  status?: string;
  runId?: string;
  hasChanges?: string;
  timestamp: string;
}

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

export interface IRealtimeEventBus {
  readonly name: string;
  publish(event: RealtimeEvent): Promise<void>;
  subscribe(userId: string, handler: RealtimeEventHandler): () => void;
  close(): Promise<void>;
}
