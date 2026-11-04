import type { SemanticPolicy } from '../extraction/contracts.js';
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
  createdAt: Date;
  updatedAt: Date;
}

export interface UserIntegrationEntity {
  id: string;
  userId: string;
  telegramEnabled: boolean;
  telegramBotToken: string | null;
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
  url: string;
  userPrompt: string;
  notificationEmail: string;
  webhookUrl?: string | null;
  cronExpression: string;
  bullmqRepeatableKey: string | null;
  contractRevision?: string | null;
  planRevision?: string | null;
  semanticPolicy?: SemanticPolicy | null;
  extractionPlan: ExtractionPlan | null;
  status: JobStatus;
  lastError: string | null;
  healingAttempts?: number;
  healingWindowStartedAt?: Date | null;
  failureCount: number;
  captureScreenshotOnChange: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRunEntity {
  id: string;
  jobId: string;
  contractRevision?: string | null;
  extractionReport?: ExtractionReport | null;
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

export type { DiffChangeEntry, DiffSummary } from '@specter/contracts';
