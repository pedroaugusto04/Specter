import type { ExtractedPayload, ExtractorConfig } from './extractor.js';

export type JobStatus =
  | 'PENDING_COMPILATION'
  | 'ACTIVE'
  | 'FAILED'
  | 'HEALING'
  | 'PAUSED';

export type RunStatus = 'SUCCESS' | 'FAILED';

export type ChangeStatus = 'YES' | 'NO' | 'INITIAL';

export interface UserEntity {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  googleId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScrapingJobEntity {
  id: string;
  userId: string;
  url: string;
  userPrompt: string;
  notificationEmail: string;
  cronExpression: string;
  bullmqRepeatableKey: string | null;
  extractorConfig: ExtractorConfig | null;
  status: JobStatus;
  lastError: string | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRunEntity {
  id: string;
  jobId: string;
  extractedData: ExtractedPayload | null;
  normalizedHash: string | null;
  hasChanges: ChangeStatus;
  status: RunStatus;
  errorMessage: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  executedAt: Date;
}

export interface DiffChangeEntry {
  field: string;
  changeType: 'ADDED' | 'MODIFIED' | 'REMOVED';
  previousValue: unknown;
  currentValue: unknown;
}

export interface DiffSummary {
  hasChanges: boolean;
  totalChanges: number;
  added: DiffChangeEntry[];
  modified: DiffChangeEntry[];
  removed: DiffChangeEntry[];
  summaryText: string;
  summaryHtml: string;
}
