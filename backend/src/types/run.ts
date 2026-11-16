import type { RunPhase } from '@specter/contracts';
export type { RunPhase } from '@specter/contracts';
export interface RunMetadata {
  executionCharged?: boolean;
  accessAttempts: number;
  confirmations: number;
  recoveryAttempts: number;
  compilationAttempts: number;
  reasons: string[];
}
export interface RunProgress {
  originQueueId?: string | null;
  phase?: RunPhase | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  nextAttemptAt?: Date | null;
  recoveredAutomatically?: boolean;
  monitorUpdatedAt?: Date | null;
  metadata?: RunMetadata | null;
}
