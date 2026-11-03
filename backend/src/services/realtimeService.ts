import type {
  IRealtimeEventBus,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeEventType,
} from '../providers/realtime/realtime.interface.js';
import { logger } from '../utils/logger.js';

export class RealtimeService {
  constructor(private readonly eventBus: IRealtimeEventBus) {}

  async notify(event: Omit<RealtimeEvent, 'timestamp'>): Promise<void> {
    try {
      await this.eventBus.publish({
        ...event,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn('Failed to publish realtime notification', {
        type: event.type,
        userId: event.userId,
        jobId: event.jobId,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async notifyJobCreated(userId: string, jobId: string, status?: string): Promise<void> {
    await this.notify({ type: 'JOB_CREATED', userId, jobId, status });
  }

  async notifyJobUpdated(userId: string, jobId: string, status?: string): Promise<void> {
    await this.notify({ type: 'JOB_UPDATED', userId, jobId, status });
  }

  async notifyJobDeleted(userId: string, jobId: string): Promise<void> {
    await this.notify({ type: 'JOB_DELETED', userId, jobId });
  }

  async notifyJobRunCompleted(
    userId: string,
    jobId: string,
    runId: string,
    hasChanges?: string
  ): Promise<void> {
    await this.notify({ type: 'JOB_RUN_COMPLETED', userId, jobId, runId, hasChanges });
  }

  subscribeUser(userId: string, handler: RealtimeEventHandler): () => void {
    return this.eventBus.subscribe(userId, handler);
  }

  async close(): Promise<void> {
    await this.eventBus.close();
  }
}
