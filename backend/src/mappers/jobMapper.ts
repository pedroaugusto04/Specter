import type { JobRunRow, ScrapingJobRow } from '../db/schema.js';
import type {
  ChangeStatus,
  JobRunEntity,
  JobStatus,
  RunStatus,
  ScrapingJobEntity,
} from '../types/domain.js';
import type { ExtractedPayload, ExtractorConfig } from '../types/extractor.js';

export interface ScrapingJobDto {
  id: string;
  userId: string;
  url: string;
  userPrompt: string;
  notificationEmail: string;
  webhookUrl: string | null;
  cronExpression: string;
  extractorConfig: ExtractorConfig | null;
  status: JobStatus;
  lastError: string | null;
  failureCount: number;
  captureScreenshotOnChange: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunDto {
  id: string;
  jobId: string;
  extractedData: ExtractedPayload | null;
  normalizedHash: string | null;
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

export const JobMapper = {
  rowToEntity(row: ScrapingJobRow): ScrapingJobEntity {
    return {
      id: row.id,
      userId: row.userId,
      url: row.url,
      userPrompt: row.userPrompt,
      notificationEmail: row.notificationEmail,
      webhookUrl: row.webhookUrl ?? null,
      cronExpression: row.cronExpression,
      bullmqRepeatableKey: row.bullmqRepeatableKey ?? null,
      extractorConfig: row.extractorConfig ?? null,
      status: row.status,
      lastError: row.lastError ?? null,
      failureCount: row.failureCount,
      captureScreenshotOnChange: row.captureScreenshotOnChange ?? false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  entityToDto(entity: ScrapingJobEntity): ScrapingJobDto {
    return {
      id: entity.id,
      userId: entity.userId,
      url: entity.url,
      userPrompt: entity.userPrompt,
      notificationEmail: entity.notificationEmail,
      webhookUrl: entity.webhookUrl ?? null,
      cronExpression: entity.cronExpression,
      extractorConfig: entity.extractorConfig,
      status: entity.status,
      lastError: entity.lastError,
      failureCount: entity.failureCount,
      captureScreenshotOnChange: entity.captureScreenshotOnChange,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  },

  rowToDto(row: ScrapingJobRow): ScrapingJobDto {
    return JobMapper.entityToDto(JobMapper.rowToEntity(row));
  },

  runRowToEntity(row: JobRunRow): JobRunEntity {
    return {
      id: row.id,
      jobId: row.jobId,
      extractedData: row.extractedData ?? null,
      normalizedHash: row.normalizedHash ?? null,
      hasChanges: row.hasChanges,
      status: row.status,
      errorMessage: row.errorMessage ?? null,
      httpStatus: row.httpStatus ?? null,
      durationMs: row.durationMs ?? null,
      screenshotUrl: row.screenshotUrl ?? null,
      executedAt: row.executedAt,
    };
  },

  runEntityToDto(entity: JobRunEntity): JobRunDto {
    return {
      id: entity.id,
      jobId: entity.jobId,
      extractedData: entity.extractedData,
      normalizedHash: entity.normalizedHash,
      hasChanges: entity.hasChanges,
      status: entity.status,
      errorMessage: entity.errorMessage,
      httpStatus: entity.httpStatus,
      durationMs: entity.durationMs,
      screenshotUrl: entity.screenshotUrl,
      executedAt: entity.executedAt.toISOString(),
    };
  },

  runRowToDto(row: JobRunRow): JobRunDto {
    return JobMapper.runEntityToDto(JobMapper.runRowToEntity(row));
  },
};
