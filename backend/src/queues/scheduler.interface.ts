export interface IJobScheduler {
  enqueueCompilation(jobId: string, reason: 'initial' | 'healing' | 'manual'): Promise<void>;
  enqueueImmediateScrape(jobId: string): Promise<void>;
  scheduleRepeatableJob(jobId: string, cronExpression: string): Promise<string | null>;
  removeRepeatableJob(jobId: string, repeatableKey?: string | null): Promise<void>;
}
