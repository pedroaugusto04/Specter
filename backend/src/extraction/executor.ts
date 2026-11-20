import { classifyAccessFailure } from '../acquisition/failure.js';
import {
  ExtractionQuality,
  FailureCode,
  TraceStatus,
  isAcceptedExtractionQuality,
} from './constants.js';
import type {
  DocumentAdapter,
  DocumentSession,
  DocumentSnapshot,
  ExtractionPlan,
  ExecutionPolicy,
  Scalar,
} from './contracts.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import type { ExtractedPayload } from '../types/extractor.js';
import { createExecutionContext } from './context.js';
import type { IPageExtractor } from './pageExtractor.js';
import {
  accumulatePageRecords,
  buildExtractedPayload,
  captureOptionalScreenshot,
  createInitialReport,
  executeSetupActions,
  pollDocumentExtraction,
} from './executorHelpers.js';

export interface ExecutionResult {
  data: ExtractedPayload;
  report: ExtractionReport;
  snapshot: DocumentSnapshot;
  durationMs: number;
}

export interface ExecutionOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  pageLanguage?: string;
  storageState?: unknown;
  captureScreenshot?: boolean;
}

export interface IExtractionExecutor {
  execute(url: string, plan: ExtractionPlan, options?: ExecutionOptions): Promise<ExecutionResult>;
}

export class ExtractionExecutor implements IExtractionExecutor {
  constructor(
    private readonly adapters: Record<'http' | 'browser', DocumentAdapter>,
    private readonly extractor: IPageExtractor,
    private readonly policy: ExecutionPolicy
  ) {}

  async execute(
    url: string,
    plan: ExtractionPlan,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const started = Date.now();
    const context = createExecutionContext(
      Math.min(this.policy.timeoutMs, options.timeoutMs ?? this.policy.timeoutMs),
      options.signal
    );

    const observedIdentities = new Set<string>();
    const records = new Map<string, Record<string, Scalar>>();
    const report = createInitialReport(plan.intent.scope);
    const origin = new URL(url).origin;
    const seenUrls = new Set<string>();

    let session: DocumentSession | undefined;
    let snapshot: DocumentSnapshot = { html: '', url, httpStatus: 0, responses: [] };
    let actions = 0;

    const runSetup = async (targetSession: DocumentSession) => {
      actions = await executeSetupActions(
        targetSession,
        plan.strategy.setup,
        context,
        actions,
        this.policy.maxActions
      );
    };

    const output = (): ExecutionResult => ({
      data: buildExtractedPayload(records, plan.intent.mode, plan.intent.identityFields),
      report,
      snapshot,
      durationMs: Date.now() - started,
    });

    const partial = (issue: string, code: ExtractionReport['failureCode'] = FailureCode.Limit) => {
      report.failureCode = code;
      report.quality = ExtractionQuality.Partial;
      report.coverage = ExtractionQuality.Partial;
      report.issues.push(issue);
      return output();
    };

    const poll = async (predicate: (page: import('./contracts.js').PageExtraction) => boolean, timeoutMs: number) => {
      const polled = await pollDocumentExtraction({
        session: session!,
        plan,
        extractor: this.extractor,
        origin,
        context,
        policy: this.policy,
        predicate,
        timeoutMs,
      });
      snapshot = polled.snapshot;
      return polled.page;
    };

    try {
      context.check();
      const acquisitionStarted = Date.now();
      session = await this.adapters[plan.strategy.transport].open(url, plan, context, options);
      report.trace!.push({
        stage: 'acquisition',
        durationMs: Date.now() - acquisitionStarted,
        status: TraceStatus.Success,
      });

      await runSetup(session);

      const isHttp = plan.strategy.transport === 'http';
      const actionTimeout = isHttp ? 0 : this.policy.actionTimeoutMs;
      let page = await poll((item) => item.ready, actionTimeout);

      for (let index = 0; index < this.policy.maxPages; index++) {
        context.check();
        report.pagesVisited++;
        report.trace!.push({
          stage: 'page-' + report.pagesVisited,
          durationMs: 0,
          status: isAcceptedExtractionQuality(page.quality)
            ? TraceStatus.Success
            : TraceStatus.Failed,
          code: page.quality,
        });

        report.validatedSourceRecords =
          (report.validatedSourceRecords ?? 0) + page.validatedSourceRecords;
        page.observedIdentities.forEach((identity) => observedIdentities.add(identity));

        for (const [key, count] of Object.entries(page.sourcesUsed)) {
          report.sourcesUsed[key] = (report.sourcesUsed[key] ?? 0) + count;
        }

        report.evidence!.push(
          ...page.evidence.slice(0, Math.max(0, this.policy.maxEvidence - report.evidence!.length))
        );
        report.targetReady = page.ready;
        report.failureReason = page.failureReason;
        report.structuralFailure =
          page.ready &&
          page.quality === ExtractionQuality.Invalid &&
          ['REQUIRED_FIELD', 'AMBIGUOUS_SELECTION', 'IDENTITY'].includes(page.failureReason ?? '');
        report.quality = page.quality;
        report.issues.push(...page.issues);

        if (!isAcceptedExtractionQuality(page.quality)) {
          report.failureCode = page.ready ? FailureCode.Source : FailureCode.Readiness;
          report.integrity =
            page.quality === ExtractionQuality.Invalid ? ExtractionQuality.Invalid : 'VALID';
          return output();
        }

        const { conflict, limitReached } = accumulatePageRecords(
          records,
          page.records,
          plan.intent.identityFields,
          this.policy.maxItems
        );

        if (conflict) {
          report.quality = ExtractionQuality.Invalid;
          report.integrity = ExtractionQuality.Invalid;
          report.structuralFailure = true;
          report.failureReason = 'IDENTITY';
          report.issues.push('Conflicting values for the same collection identity.');
          return output();
        }

        if (limitReached) {
          return partial('Item limit reached.');
        }

        if (page.ended) {
          report.quality = records.size ? ExtractionQuality.Complete : ExtractionQuality.Empty;
          report.coverage = records.size ? ExtractionQuality.Complete : ExtractionQuality.Empty;
          if (options.captureScreenshot) {
            await captureOptionalScreenshot(session, snapshot, report.issues);
          }
          return output();
        }

        const pagination = plan.strategy.pagination!;
        if (index + 1 >= this.policy.maxPages || actions >= this.policy.maxActions) {
          return partial('Pagination limit reached.');
        }

        actions++;
        const before = new Set(observedIdentities);

        if (pagination.kind === 'link') {
          const nextUrl = page.nextUrl;
          if (!nextUrl || new URL(nextUrl).origin !== origin || seenUrls.has(nextUrl)) {
            return partial(
              'Pagination URL is missing, repeated or outside the allowed origin.',
              FailureCode.NoProgress
            );
          }
          seenUrls.add(snapshot.url);
          seenUrls.add(nextUrl);
          await session.close();
          session = await this.adapters[plan.strategy.transport].open(
            nextUrl,
            plan,
            context,
            options
          );
          await runSetup(session);
        } else {
          await session.advance(pagination);
        }

        const hasProgress = (item: import('./contracts.js').PageExtraction) =>
          item.ended ||
          (isAcceptedExtractionQuality(item.quality) &&
            item.observedIdentities.some((identity) => !before.has(identity)));

        page = await poll(hasProgress, actionTimeout);
        if (!hasProgress(page)) {
          return partial(
            'No new identities or completion evidence after pagination.',
            FailureCode.NoProgress
          );
        }
      }

      return partial('Page limit reached.');
    } catch (error) {
      if (!records.size || classifyAccessFailure(error)) throw error;
      return partial(
        error instanceof Error ? error.message : 'Execution interrupted.',
        context.signal.aborted ? FailureCode.Timeout : FailureCode.Navigation
      );
    } finally {
      await session?.close();
      report.trace!.push({
        stage: 'extraction',
        durationMs: Date.now() - started,
        status: isAcceptedExtractionQuality(report.quality)
          ? TraceStatus.Success
          : TraceStatus.Failed,
        code: report.quality,
      });
    }
  }
}
