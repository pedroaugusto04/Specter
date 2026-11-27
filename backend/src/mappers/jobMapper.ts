import { presentStoredError } from '../utils/errorSanitizer.js';
import { decryptText } from '../utils/crypto.js';
import type {
  ExtractedPayload,
  FieldDefinitionDto,
  IntentField,
  JobPlanVersionDto,
  JobRunDto,
  JobTimeseriesPointDto,
  Scalar,
  ScrapingJobDto,
} from '@specter/contracts';
import type { AccessState } from '../acquisition/cooldown.js';
import type { JobPlanVersionRow, JobRunRow, ScrapingJobRow } from '../db/schema.js';
import type {
  JobPlanVersionEntity,
  JobRunEntity,
  ScrapingJobEntity,
  TimeseriesRowEntity,
} from '../types/domain.js';
import { ChangeStatus, JobStatus, RunStatus, parseEnumValue } from '../types/enums.js';

function projectIntentFields(
  fields: Record<string, IntentField>
): Record<string, FieldDefinitionDto> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [
      key,
      { displayName: field.displayName, type: field.type, locale: field.locale },
    ])
  );
}

export interface TimeseriesRowRaw {
  id: string;
  executedAt: Date;
  status: string;
  hasChanges: string;
  durationMs: number | null;
  contractRevision: string | null;
  errorMessage: string | null;
  extractedData: ExtractedPayload | null;
}

export const JobMapper = {
  rowToEntity(row: ScrapingJobRow): ScrapingJobEntity {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      url: row.url,
      userPrompt: row.userPrompt,
      notificationEmail: row.notificationEmail,
      webhookUrl: row.webhookUrl,
      webhookSecret: decryptText(row.webhookSecret),
      cronExpression: row.cronExpression,
      bullmqRepeatableKey: row.bullmqRepeatableKey,
      contractRevision: row.contractRevision,
      planRevision: row.planRevision,
      extractionPlan: row.extractionPlan,
      status: parseEnumValue(JobStatus, row.status, 'job status'),
      lastError: row.lastError,
      recoveryAttempts: row.recoveryAttempts,
      recoveryWindowStartedAt: row.recoveryWindowStartedAt,
      captureScreenshotOnChange: row.captureScreenshotOnChange,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  entityToDto(
    entity: ScrapingJobEntity,
    context: { accessState: AccessState | null; currentRun: JobRunEntity | null }
  ): ScrapingJobDto {
    return {
      id: entity.id,
      name: entity.name,
      url: entity.url,
      userPrompt: entity.userPrompt,
      notificationEmail: entity.notificationEmail ?? '',
      webhookUrl: entity.webhookUrl,
      hasWebhookSecret: Boolean(entity.webhookSecret),
      cronExpression: entity.cronExpression,
      extractionPlan: entity.extractionPlan
        ? {
            intent: {
              scope: entity.extractionPlan.intent.scope,
              identityFields: entity.extractionPlan.intent.identityFields,
              fields: projectIntentFields(entity.extractionPlan.intent.fields),
              triggerRules: entity.extractionPlan.intent.triggerRules,
              triggerMatchMode: entity.extractionPlan.intent.triggerMatchMode,
            },
          }
        : null,
      contractRevision: entity.contractRevision,
      status: entity.status,
      accessState: context.accessState,
      currentRun: context.currentRun ? JobMapper.runEntityToDto(context.currentRun) : null,
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
      extractedData: row.extractedData,
      normalizedHash: row.normalizedHash,
      hasChanges: parseEnumValue(ChangeStatus, row.hasChanges, 'change status'),
      status: parseEnumValue(RunStatus, row.status, 'run status'),
      errorMessage: row.errorMessage,
      httpStatus: row.httpStatus,
      durationMs: row.durationMs,
      screenshotUrl: row.screenshotUrl,
      executedAt: row.executedAt,
    };
  },

  runEntityToDto(entity: JobRunEntity): JobRunDto {
    return {
      id: entity.id,
      jobId: entity.jobId,
      phase: entity.phase,
      startedAt: entity.startedAt?.toISOString() ?? null,
      completedAt: entity.completedAt?.toISOString() ?? null,
      nextAttemptAt: entity.nextAttemptAt?.toISOString() ?? null,
      recoveredAutomatically: entity.recoveredAutomatically,
      extractionReport: entity.extractionReport
        ? { quality: entity.extractionReport.quality, coverage: entity.extractionReport.coverage }
        : null,
      extractedData: entity.extractedData,
      hasChanges: entity.hasChanges,
      contractRevision: entity.contractRevision,
      status: entity.status,
      errorMessage: presentStoredError(entity.errorMessage),
      httpStatus: entity.httpStatus,
      durationMs: entity.durationMs,
      screenshotUrl: entity.screenshotUrl,
      executedAt: entity.executedAt.toISOString(),
    };
  },

  timeseriesRowToEntity(row: TimeseriesRowRaw): TimeseriesRowEntity {
    return {
      id: row.id,
      executedAt: row.executedAt,
      status: parseEnumValue(RunStatus, row.status, 'run status'),
      hasChanges: parseEnumValue(ChangeStatus, row.hasChanges, 'change status'),
      durationMs: row.durationMs,
      contractRevision: row.contractRevision,
      errorMessage: row.errorMessage,
      extractedData: row.extractedData,
    };
  },

  extractScalarValues(payload: ExtractedPayload | null): Record<string, Scalar> {
    if (!payload) return {};

    if ('items' in payload && Array.isArray(payload.items)) {
      return { itemCount: payload.items.length };
    }

    const result: Record<string, Scalar> = {};
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
      contractRevision: entity.contractRevision,
      errorMessage: presentStoredError(entity.errorMessage),
      values: JobMapper.extractScalarValues(entity.extractedData),
    };
  },

  planVersionRowToEntity(row: JobPlanVersionRow): JobPlanVersionEntity {
    return {
      id: row.id,
      jobId: row.jobId,
      versionNumber: row.versionNumber,
      planRevision: row.planRevision,
      contractRevision: row.contractRevision,
      url: row.url,
      userPrompt: row.userPrompt,
      extractionPlan: row.extractionPlan,
      triggerReason: row.triggerReason,
      createdByRunId: row.createdByRunId,
      createdAt: row.createdAt,
    };
  },

  planVersionEntityToDto(
    entity: JobPlanVersionEntity,
    activePlanRevision: string | null
  ): JobPlanVersionDto {
    return {
      id: entity.id,
      jobId: entity.jobId,
      versionNumber: entity.versionNumber,
      planRevision: entity.planRevision,
      contractRevision: entity.contractRevision,
      url: entity.url,
      userPrompt: entity.userPrompt,
      triggerReason: entity.triggerReason,
      isActive: Boolean(activePlanRevision && entity.planRevision === activePlanRevision),
      fields: projectIntentFields(entity.extractionPlan.intent.fields),
      createdAt: entity.createdAt.toISOString(),
    };
  },
};
