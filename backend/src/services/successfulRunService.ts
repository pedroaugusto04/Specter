import type { ExtractionPlan } from '../types/extractionPlan.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import type { IJobRepository, CreateJobRunInput } from '../repositories/jobRepository.js';
import type { IStorageProvider } from '../providers/storage/storage.interface.js';
import type { IAlertRouter } from '../notifications/contracts.js';
import type { PlanExecutionResult } from './planExecutionService.js';
import { ChangeStatus, RunStatus } from '../types/enums.js';
import { computeExtractionHash } from '../utils/diffHasher.js';
import { buildChangeAlert } from '../utils/changeAlertHelper.js';
import { presentExtractionReport } from '../utils/errorSanitizer.js';
import { uploadScreenshotIfEligible } from '../utils/screenshotHelper.js';

export interface SuccessfulRunDeps {
  jobRepository: Pick<IJobRepository, 'findLatestSuccessfulRun'>;
  storageProvider: IStorageProvider;
  alertRouter: IAlertRouter;
}

export interface SuccessfulRunInput {
  job: ScrapingJobEntity;
  plan: ExtractionPlan;
  execution: PlanExecutionResult;
  contractRevision: string | null | undefined;
  startedAt: number;
  logContext: string;
  timezone?: string;
}

/** Common preparation; callers retain lifecycle decisions and the atomic commit. */
export class SuccessfulRunService {
  constructor(private readonly deps: SuccessfulRunDeps) {}

  async prepare(input: SuccessfulRunInput) {
    const { job, plan, execution, contractRevision } = input;
    const normalizedHash = computeExtractionHash(execution.data);
    const candidate = await this.deps.jobRepository.findLatestSuccessfulRun(job.id);
    const previous = candidate?.contractRevision === contractRevision ? candidate : null;
    const hasChanges = !previous
      ? ChangeStatus.Initial
      : previous.normalizedHash === normalizedHash
        ? ChangeStatus.Unchanged
        : ChangeStatus.Changed;
    const screenshotUrl = await uploadScreenshotIfEligible({
      jobId: job.id,
      captureScreenshotOnChange: job.captureScreenshotOnChange,
      hasChanges,
      screenshot: execution.scrape.screenshot,
      storageProvider: this.deps.storageProvider,
      logContext: input.logContext,
    });
    const alert =
      hasChanges === ChangeStatus.Changed && previous
        ? buildChangeAlert({
            job: { ...job, extractionPlan: plan },
            currentData: execution.data,
            previousData: previous.extractedData,
            triggerRules: plan.intent.triggerRules,
            triggerMatchMode: plan.intent.triggerMatchMode,
            timezone: input.timezone,
          })
        : null;
    const deliveries = alert ? await this.deps.alertRouter.prepare(alert) : [];
    const run: CreateJobRunInput = {
      jobId: job.id,
      extractedData: execution.data,
      normalizedHash,
      hasChanges,
      status: RunStatus.Success,
      extractionReport: presentExtractionReport(execution.report),
      contractRevision,
      httpStatus: execution.scrape.httpStatus,
      durationMs: Date.now() - input.startedAt,
      screenshotUrl,
    };
    return { run, deliveries };
  }
}
