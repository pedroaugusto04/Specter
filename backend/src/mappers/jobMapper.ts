import type { ScrapingJobDto, JobRunDto } from '@specter/contracts';
import { presentExtractionReport } from '../utils/errorSanitizer.js';
import type { AccessState } from '../acquisition/cooldown.js';
import type { JobRunRow, ScrapingJobRow } from '../db/schema.js';
import type { JobRunEntity, ScrapingJobEntity } from '../types/domain.js';
import { ChangeStatus, JobStatus, RunStatus, parseEnumValue } from '../types/enums.js';
import { decryptText } from '../utils/crypto.js';

export const JobMapper = {
  rowToEntity(row: ScrapingJobRow): ScrapingJobEntity {
    return {
      id: row.id,
      userId: row.userId,
      url: row.url,
      userPrompt: row.userPrompt,
      notificationEmail: row.notificationEmail ?? null,
      webhookUrl: row.webhookUrl ?? null,
      webhookSecret: decryptText(row.webhookSecret),
      cronExpression: row.cronExpression,
      bullmqRepeatableKey: row.bullmqRepeatableKey ?? null,
      contractRevision: row.contractRevision,
      planRevision: row.planRevision,
      extractionPlan: row.extractionPlan ?? null,
      status: parseEnumValue(JobStatus, row.status, 'job status'),
      lastError: row.lastError ?? null,
      failureCount: row.failureCount,
      healingAttempts: row.healingAttempts,
      healingWindowStartedAt: row.healingWindowStartedAt,
      captureScreenshotOnChange: row.captureScreenshotOnChange ?? false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  entityToDto(
    entity: ScrapingJobEntity,
    context: { accessState: AccessState | null }
  ): ScrapingJobDto {
    return {
      id: entity.id,
      url: entity.url,
      userPrompt: entity.userPrompt,
      notificationEmail: entity.notificationEmail ?? '',
      webhookUrl: entity.webhookUrl ?? null,
      hasWebhookSecret: Boolean(entity.webhookSecret),
      cronExpression: entity.cronExpression,
      extractionPlan: entity.extractionPlan,
      status: entity.status,
      accessState: context.accessState,
      lastError: entity.lastError,
      failureCount: entity.failureCount,
      captureScreenshotOnChange: entity.captureScreenshotOnChange,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  },

  runRowToEntity(row: JobRunRow): JobRunEntity {
    return {
      id: row.id,
      jobId: row.jobId,
      contractRevision: row.contractRevision,
      extractionReport: row.extractionReport,
      extractedData: row.extractedData ?? null,
      normalizedHash: row.normalizedHash ?? null,
      hasChanges: parseEnumValue(ChangeStatus, row.hasChanges, 'change status'),
      status: parseEnumValue(RunStatus, row.status, 'run status'),
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
      extractionReport: entity.extractionReport
        ? presentExtractionReport(entity.extractionReport)
        : entity.extractionReport,
      extractedData: entity.extractedData,
      hasChanges: entity.hasChanges,
      status: entity.status,
      errorMessage: entity.errorMessage,
      httpStatus: entity.httpStatus,
      durationMs: entity.durationMs,
      screenshotUrl: entity.screenshotUrl,
      executedAt: entity.executedAt.toISOString(),
    };
  },
};
