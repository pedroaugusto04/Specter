import type { ExtractionPlan, ExtractionReport } from './extraction.js';
import type { JobStatus, RunStatus, ChangeStatus, AccessFailure } from './vocabulary.js';
import type { ExtractedPayload } from './payload.js';
import type { DiffSummary } from './diff.js';
export interface AccessState {
  reason: typeof AccessFailure.Blocked;
  retryAt: string;
}
export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  createdAt: string;
}

export interface SessionDto {
  id: string;
  domain: string;
  name: string;
  cookieCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserIntegrationsDto {
  id: string | null;
  userId: string;
  telegramEnabled: boolean;
  telegramChatId: string | null;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  hasWebhookSecret: boolean;
  botUsername?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ScrapingJobDto {
  id: string;
  url: string;
  userPrompt: string;
  notificationEmail: string;
  webhookUrl: string | null;
  cronExpression: string;
  extractionPlan: ExtractionPlan | null;
  status: JobStatus;
  accessState?: AccessState | null;
  lastError: string | null;
  failureCount: number;
  captureScreenshotOnChange: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunDto {
  id: string;
  jobId: string;
  extractionReport?: ExtractionReport | null;
  extractedData: ExtractedPayload | null;
  hasChanges: ChangeStatus;
  status: RunStatus;
  errorMessage: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  screenshotUrl: string | null;
  executedAt: string;
}

export interface DashboardStatsDto {
  totalJobs: number;
  activeJobs: number;
  healingOrCompilingJobs: number;
  failedOrPausedJobs: number;
  totalRuns: number;
  DetectedChangesCount: number;
}

export interface CreateJobRequest {
  url: string;
  userPrompt: string;
  notificationEmail?: string | null;
  webhookUrl?: string | null;
  cronExpression?: string;
  captureScreenshotOnChange?: boolean;
}
export interface UpdateJobRequest extends Partial<CreateJobRequest> {
  triggerRules?: import('./extraction.js').TriggerRule[];
  triggerMatchMode?: import('./vocabulary.js').TriggerMatchMode;
}
export interface UpdateIntegrationsRequest {
  telegramEnabled: boolean;
  telegramChatId?: string | null;
  webhookEnabled: boolean;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
}
export interface ProbeUrlDto {
  accessible: boolean;
  reason?: string;
  hasSavedSession?: boolean;
}
export interface TriggerJobDto {
  queued: boolean;
  mode: 'scrape' | 'compile';
}
export interface JobRunsDto {
  runs: JobRunDto[];
  latestDiff: DiffSummary | null;
}
export interface SessionCheckDto {
  hasSession: boolean;
  session: SessionDto | null;
}
export interface NotificationTestDto {
  success: boolean;
  message: string;
}

export type RealtimeEventType = 'JOB_CREATED' | 'JOB_UPDATED' | 'JOB_DELETED' | 'JOB_RUN_COMPLETED';
export interface RealtimeEventDto {
  type: RealtimeEventType;
  userId: string;
  jobId: string;
  status?: string;
  runId?: string;
  hasChanges?: string;
  timestamp: string;
}
