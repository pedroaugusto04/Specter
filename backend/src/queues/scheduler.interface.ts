export const CompilationReason = {
  Initial: 'initial',
  Healing: 'healing',
  Manual: 'manual',
} as const;

export type CompilationReason = (typeof CompilationReason)[keyof typeof CompilationReason];

export interface IJobScheduler {
  enqueueCompilation(jobId: string, reason: CompilationReason): Promise<void>;
  removePendingCompilations(jobId: string): Promise<void>;
  enqueueImmediateScrape(jobId: string): Promise<void>;
  scheduleRepeatableJob(jobId: string, cronExpression: string): Promise<string | null>;
  removeRepeatableJob(jobId: string, repeatableKey?: string | null): Promise<void>;
}
