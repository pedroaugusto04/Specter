import type { ChangeStatus, JobStatus, RunStatus } from '@specter/contracts';
import type {
  IRealtimeEventBus,
  RealtimeEvent,
  RealtimeEventHandler,
} from '../providers/realtime/realtime.interface.js';
import { getErrorMessage } from '../utils/errors.js';
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
        errorMessage: getErrorMessage(err),
      });
    }
  }

  async notifyJobCreated(userId: string, jobId: string, status?: JobStatus): Promise<void> {
    await this.notify({ type: 'JOB_CREATED', userId, jobId, status });
  }

  async notifyJobUpdated(
    userId: string,
    jobId: string,
    status?: JobStatus | RunStatus
  ): Promise<void> {
    await this.notify({ type: 'JOB_UPDATED', userId, jobId, status });
  }

  async notifyJobDeleted(userId: string, jobId: string): Promise<void> {
    await this.notify({ type: 'JOB_DELETED', userId, jobId });
  }

  async notifyJobRunCompleted(
    userId: string,
    jobId: string,
    runId: string,
    hasChanges?: ChangeStatus
  ): Promise<void> {
    await this.notify({ type: 'JOB_RUN_COMPLETED', userId, jobId, runId, hasChanges });
  }

  async notifyJobCompilationFailed(
    userId: string,
    jobId: string,
    message: string,
    fallbackToPrevious: boolean
  ): Promise<void> {
    await this.notify({
      type: 'JOB_COMPILATION_FAILED',
      userId,
      jobId,
      message,
      fallbackToPrevious,
    });
  }

  subscribeUser(
    userId: string,
    handler: RealtimeEventHandler,
    onDisconnect?: () => void
  ): Promise<() => void> {
    return this.eventBus.subscribe(userId, handler, onDisconnect);
  }

  async close(): Promise<void> {
    await this.eventBus.close();
  }
}
