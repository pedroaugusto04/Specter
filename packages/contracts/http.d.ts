import type {
  ExtractionIntent,
  ExtractionReport,
  IntentField,
  Scalar,
  TriggerRule,
} from './extraction.js';
import type {
  JobStatus,
  RunStatus,
  RunPhase,
  ChangeStatus,
  AccessFailure,
  TriggerMatchMode,
} from './vocabulary.js';
import type { ExtractedPayload } from './payload.js';
import type { DiffSummary } from './diff.js';

export type FieldDefinitionDto = Pick<IntentField, 'displayName' | 'type' | 'locale'>;
export type JobStatusFilter = JobStatus | 'recovering' | 'paused';
export interface AccessState {
  reason: typeof AccessFailure.Blocked;
  retryAt: string;
}
export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  pageLanguage: string | null;
  browserPageLanguage: string | null;
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
  currentRun?: JobRunDto | null;
  id: string;
  name: string;
  url: string;
  userPrompt: string;
  notificationEmail: string;
  webhookUrl: string | null;
  hasWebhookSecret?: boolean;
  cronExpression: string;
  extractionPlan: {
    intent: Pick<
      ExtractionIntent,
      'scope' | 'identityFields' | 'triggerRules' | 'triggerMatchMode'
    > & {
      fields: Record<string, FieldDefinitionDto>;
    };
  } | null;
  contractRevision: string | null;
  status: JobStatus;
  accessState?: AccessState | null;
  lastError: string | null;
  captureScreenshotOnChange: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunDto {
  phase?: RunPhase | null;
  startedAt?: string | null;
  completedAt?: string | null;
  nextAttemptAt?: string | null;
  recoveredAutomatically?: boolean;
  id: string;
  jobId: string;
  contractRevision: string | null;
  extractionReport?: Pick<ExtractionReport, 'quality' | 'coverage'> | null;
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
  recoveringOrCompilingJobs: number;
  failedOrPausedJobs: number;
  totalRuns: number;
  DetectedChangesCount: number;
}

export interface MetricQuotaSummary {
  used: number;
  limit: number;
  remaining: number;
}

export interface UserQuotaSummary {
  activeMonitors: MetricQuotaSummary;
  monthlyCompilations: MetricQuotaSummary;
  monthlyExecutions: MetricQuotaSummary;
}

export interface CreateJobRequest {
  name?: string;
  url: string;
  userPrompt: string;
  notificationEmail?: string;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  cronExpression?: string;
  captureScreenshotOnChange?: boolean;
}
export interface UpdateJobRequest extends Partial<CreateJobRequest> {
  triggerRules?: TriggerRule[];
  triggerMatchMode?: TriggerMatchMode;
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
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}
export interface JobRunsSummaryDto {
  totalRuns: number;
  changedRuns: number;
  lastChange: string | null;
  averageDurationMs: number | null;
}
export interface JobRunsDto {
  latestSuccessfulRun?: JobRunDto | null;
  previousCollectionRun?: JobRunDto | null;
  runs: JobRunDto[];
  latestDiff: DiffSummary | null;
  pagination: PaginationMeta;
  summary: JobRunsSummaryDto;
}
export type TimeseriesRange = '24h' | '7d' | '30d' | 'all';
export interface JobTimeseriesPointDto {
  id: string;
  executedAt: string;
  status: RunStatus;
  hasChanges: ChangeStatus;
  durationMs: number | null;
  contractRevision: string | null;
  errorMessage: string | null;
  values: Record<string, Scalar>;
}
export interface JobTimeseriesDto {
  jobId: string;
  range: TimeseriesRange;
  points: JobTimeseriesPointDto[];
  previousPoint: JobTimeseriesPointDto | null;
  pagination: PaginationMeta;
}
export interface SessionCheckDto {
  hasSession: boolean;
  session: SessionDto | null;
}
export interface NotificationTestDto {
  success: boolean;
  message: string;
}

export interface JobPlanVersionDto {
  id: string;
  jobId: string;
  versionNumber: number;
  planRevision: string;
  contractRevision: string | null;
  url: string;
  userPrompt: string;
  triggerReason: string;
  isActive: boolean;
  fields: Record<string, FieldDefinitionDto>;
  createdAt: string;
}

export interface JobPlanVersionsDto {
  jobId: string;
  activeVersionNumber: number | null;
  versions: JobPlanVersionDto[];
  pagination: PaginationMeta;
}

export interface RollbackJobRequest {
  versionNumber: number;
}

export type RealtimeEventType =
  | 'JOB_CREATED'
  | 'JOB_UPDATED'
  | 'JOB_DELETED'
  | 'JOB_RUN_COMPLETED'
  | 'JOB_COMPILATION_FAILED';
export interface RealtimeEventDto {
  type: RealtimeEventType;
  userId: string;
  jobId: string;
  status?: JobStatus | RunStatus;
  runId?: string;
  hasChanges?: ChangeStatus;
  message?: string;
  fallbackToPrevious?: boolean;
  timestamp: string;
}
