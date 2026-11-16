export const CompilationReason = {
  Initial: 'initial',
  Recovery: 'recovery',
  Manual: 'manual',
} as const;

export type CompilationReason = (typeof CompilationReason)[keyof typeof CompilationReason];

export interface IJobScheduler {
  enqueueCompilation(jobId: string, reason: CompilationReason, runId?: string): Promise<void>;
  enqueueRunAttempt(jobId: string, runId: string, attempt: number, at: Date): Promise<void>;
  removePendingCompilations(jobId: string): Promise<void>;
  enqueueImmediateScrape(jobId: string): Promise<void>;
  scheduleRepeatableJob(jobId: string, cronExpression: string): Promise<string | null>;
  removeRepeatableJob(jobId: string, repeatableKey?: string | null): Promise<void>;
}
