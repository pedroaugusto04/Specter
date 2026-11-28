import type { RunMetadata, RunPhase } from './run.js';
import type { ExtractionPlan, ExtractionReport } from './extractionPlan.js';
import type { ChangeStatus, JobStatus, RunStatus } from './enums.js';
import type { ExtractedPayload } from './extractor.js';
import type { PlaywrightStorageState } from './session.js';

export type { ChangeStatus, JobStatus, RunStatus } from './enums.js';

export interface UserEntity {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  googleId: string | null;
  timezone: string;
  pageLanguage: string | null;
  browserPageLanguage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserIntegrationEntity {
  id: string;
  userId: string;
  telegramEnabled: boolean;
  telegramChatId: string | null;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  webhookSecret: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWebSessionEntity {
  id: string;
  userId: string;
  domain: string;
  name: string;
  storageState: PlaywrightStorageState;
  cookieCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScrapingJobEntity {
  id: string;
  userId: string;
  name: string;
  url: string;
  userPrompt: string;
  notificationEmail: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  cronExpression: string;
  bullmqRepeatableKey: string | null;
  contractRevision: string | null;
  planRevision: string | null;
  extractionPlan: ExtractionPlan | null;
  status: JobStatus;
  lastError: string | null;
  recoveryAttempts: number;
  recoveryWindowStartedAt: Date | null;
  lastFailureAlertAt: Date | null;
  captureScreenshotOnChange: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRunEntity {
  id: string;
  jobId: string;
  originQueueId: string | null;
  phase: RunPhase | null;
  startedAt: Date | null;
  completedAt: Date | null;
  nextAttemptAt: Date | null;
  monitorUpdatedAt: Date | null;
  recoveredAutomatically: boolean;
  metadata: RunMetadata | null;
  contractRevision: string | null;
  extractionReport: ExtractionReport | null;
  extractedData: ExtractedPayload | null;
  normalizedHash: string | null;
  hasChanges: ChangeStatus;
  status: RunStatus;
  errorMessage: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  screenshotUrl: string | null;
  executedAt: Date;
}

export interface TimeseriesRowEntity {
  id: string;
  executedAt: Date;
  status: RunStatus;
  hasChanges: ChangeStatus;
  durationMs: number | null;
  contractRevision: string | null;
  errorMessage: string | null;
  extractedData: ExtractedPayload | null;
}

export interface JobPlanVersionEntity {
  id: string;
  jobId: string;
  versionNumber: number;
  planRevision: string;
  contractRevision: string | null;
  url: string;
  userPrompt: string;
  extractionPlan: ExtractionPlan;
  triggerReason: string;
  createdByRunId: string | null;
  createdAt: Date;
}

export type NewJobPlanVersion = Omit<JobPlanVersionEntity, 'id' | 'createdAt'>;

export type { DiffChangeEntry, DiffSummary } from '@specter/contracts';
