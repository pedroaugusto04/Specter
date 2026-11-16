import { presentStoredError } from '../utils/errorSanitizer.js';
import { decryptText } from '../utils/crypto.js';
import type {
  ScrapingJobDto,
  JobRunDto,
  JobTimeseriesPointDto,
  ExtractedPayload,
} from '@specter/contracts';
import type { AccessState } from '../acquisition/cooldown.js';
import type { JobRunRow, ScrapingJobRow } from '../db/schema.js';
import type { JobRunEntity, ScrapingJobEntity, TimeseriesRowEntity } from '../types/domain.js';
import { ChangeStatus, JobStatus, RunStatus, parseEnumValue } from '../types/enums.js';

export const JobMapper = {
  rowToEntity(row: ScrapingJobRow): ScrapingJobEntity {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
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
      recoveryAttempts: row.recoveryAttempts,
      recoveryWindowStartedAt: row.recoveryWindowStartedAt,
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
      name: entity.name,
      url: entity.url,
      userPrompt: entity.userPrompt,
      notificationEmail: entity.notificationEmail ?? '',
      webhookUrl: entity.webhookUrl ?? null,
      hasWebhookSecret: Boolean(entity.webhookSecret),
      cronExpression: entity.cronExpression,
      extractionPlan: entity.extractionPlan
        ? {
            intent: {
              scope: entity.extractionPlan.intent.scope,
              identityFields: entity.extractionPlan.intent.identityFields,
              fields: Object.fromEntries(
                Object.entries(entity.extractionPlan.intent.fields).map(([key, field]) => [
                  key,
                  { displayName: field.displayName, type: field.type, locale: field.locale },
                ])
              ),
              triggerRules: entity.extractionPlan.intent.triggerRules,
              triggerMatchMode: entity.extractionPlan.intent.triggerMatchMode,
            },
          }
        : null,
      contractRevision: entity.contractRevision ?? null,
      status: entity.status,
      accessState: context.accessState,
      lastError: presentStoredError(entity.lastError),
      captureScreenshotOnChange: entity.captureScreenshotOnChange,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  },

  runRowToEntity(row: JobRunRow): JobRunEntity {
    return {
      id: row.id,
      jobId: row.jobId,
      originQueueId: row.originQueueId,
      phase: row.phase,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      nextAttemptAt: row.nextAttemptAt,
      monitorUpdatedAt: row.monitorUpdatedAt,
      metadata: row.metadata,
      recoveredAutomatically: row.recoveredAutomatically,
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
      phase: entity.phase ?? null,
      startedAt: entity.startedAt?.toISOString() ?? null,
      completedAt: entity.completedAt?.toISOString() ?? null,
      nextAttemptAt: entity.nextAttemptAt?.toISOString() ?? null,
      recoveredAutomatically: entity.recoveredAutomatically ?? false,
      extractionReport: entity.extractionReport
        ? { quality: entity.extractionReport.quality, coverage: entity.extractionReport.coverage }
        : entity.extractionReport,
      extractedData: entity.extractedData,
      hasChanges: entity.hasChanges,
      contractRevision: entity.contractRevision ?? null,
      status: entity.status,
      errorMessage: presentStoredError(entity.errorMessage),
      httpStatus: entity.httpStatus,
      durationMs: entity.durationMs,
      screenshotUrl: entity.screenshotUrl,
      executedAt: entity.executedAt.toISOString(),
    };
  },

  extractScalarValues(
    payload: ExtractedPayload | null
  ): Record<string, string | number | boolean | null> {
    if (!payload) return {};

    if ('items' in payload && Array.isArray(payload.items)) {
      return { itemCount: payload.items.length };
    }

    const result: Record<string, string | number | boolean | null> = {};
    for (const [key, val] of Object.entries(payload)) {
      if (
        typeof val === 'number' ||
        typeof val === 'boolean' ||
        typeof val === 'string' ||
        val === null
      ) {
        result[key] = val;
      }
    }
    return result;
  },

  timeseriesPointToDto(entity: TimeseriesRowEntity): JobTimeseriesPointDto {
    return {
      id: entity.id,
      executedAt: entity.executedAt.toISOString(),
      status: entity.status,
      hasChanges: entity.hasChanges,
      durationMs: entity.durationMs,
      contractRevision: entity.contractRevision ?? null,
      errorMessage: presentStoredError(entity.errorMessage),
      values: JobMapper.extractScalarValues(entity.extractedData),
    };
  },
};
