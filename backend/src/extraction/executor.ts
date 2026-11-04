import {
  ExtractionMode,
  ExtractionQuality,
  FailureCode,
  TraceStatus,
  isAcceptedExtractionQuality,
} from './constants.js';
import { UpstreamHttpError } from '../errors/domainErrors.js';
import type {
  DocumentAdapter,
  DocumentSession,
  DocumentSnapshot,
  ExtractionPlan,
  ExecutionPolicy,
  PageExtraction,
  Scalar,
} from './contracts.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import type { ExtractedPayload } from '../types/extractor.js';
import { createExecutionContext, waitForPoll } from './context.js';
import { recordIdentity, compareIdentityText } from './values.js';
import type { IPageExtractor } from './pageExtractor.js';

export interface ExecutionResult {
  data: ExtractedPayload;
  report: ExtractionReport;
  snapshot: DocumentSnapshot;
}

export interface ExecutionOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
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
    const report: ExtractionReport = {
      quality: ExtractionQuality.Inconclusive,
      scope: plan.intent.scope,
      pagesVisited: 0,
      issues: [],
      sourcesUsed: {},
      evidence: [],
      trace: [],
      integrity: 'VALID',
      coverage: 'UNKNOWN',
    };
    let session: DocumentSession | undefined;
    let snapshot: DocumentSnapshot = { html: '', url, httpStatus: 0, responses: [] };
    const origin = new URL(url).origin;
    let actions = 0;
    const initialize = async () => {
      for (const action of plan.strategy.setup ?? []) {
        context.check();
        if (actions >= this.policy.maxActions) throw new Error('Setup action limit reached.');
        actions++;
        await session!.discover(action);
      }
    };
    const seenUrls = new Set<string>();
    const output = (): ExecutionResult => ({
      data:
        plan.intent.mode === ExtractionMode.Single
          ? ([...records.values()][0] ?? {})
          : {
              items: [...records.values()].sort((a, b) =>
                compareIdentityText(
                  recordIdentity(a, plan.intent.identityFields),
                  recordIdentity(b, plan.intent.identityFields)
                )
              ),
              count: records.size,
            },
      report,
      snapshot,
    });
    const observe = async (): Promise<PageExtraction> => {
      context.check();
      const observed = new Map<string, boolean>();
      const conditions = [
        ...plan.strategy.ready,
        ...plan.strategy.empty,
        ...(plan.strategy.pagination?.end ?? []),
      ];
      for (const condition of conditions) {
        const value = await session!.check(condition);
        if (value !== undefined) observed.set(JSON.stringify(condition), value);
      }
      // Capture after live checks so terminal evidence cannot precede the final records.
      snapshot = await session!.snapshot();
      if (snapshot.httpStatus >= 400) throw new UpstreamHttpError(snapshot.httpStatus);
      if (new URL(snapshot.url).origin !== origin)
        throw new Error('Navigation escaped the original origin.');
      return this.extractor.extract(snapshot, plan, observed);
    };
    const waitPage = async (
      predicate: (page: PageExtraction) => boolean,
      timeoutMs: number
    ): Promise<PageExtraction> => {
      const deadline = Math.min(context.deadline, Date.now() + timeoutMs);
      let page = await observe();
      while (!predicate(page) && Date.now() < deadline) {
        await waitForPoll(context, this.policy);
        page = await observe();
      }
      return page;
    };
    const partial = (issue: string, code: ExtractionReport['failureCode'] = FailureCode.Limit) => {
      report.failureCode = code;
      report.quality = ExtractionQuality.Partial;
      report.coverage = ExtractionQuality.Partial;
      report.issues.push(issue);
      return output();
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
      await initialize();
      let page = await waitPage((item) => item.ready, this.policy.actionTimeoutMs);
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
        for (const [key, count] of Object.entries(page.sourcesUsed))
          report.sourcesUsed[key] = (report.sourcesUsed[key] ?? 0) + count;
        report.evidence!.push(
          ...page.evidence.slice(0, Math.max(0, this.policy.maxEvidence - report.evidence!.length))
        );
        report.quality = page.quality;
        report.issues.push(...page.issues);
        if (!isAcceptedExtractionQuality(page.quality)) {
          report.failureCode = page.ready ? FailureCode.Source : FailureCode.Readiness;
          report.integrity =
            page.quality === ExtractionQuality.Invalid ? ExtractionQuality.Invalid : 'VALID';
          return output();
        }
        for (const record of page.records) {
          const key = recordIdentity(record, plan.intent.identityFields);
          if (records.has(key) && JSON.stringify(records.get(key)) !== JSON.stringify(record)) {
            report.quality = ExtractionQuality.Invalid;
            report.integrity = ExtractionQuality.Invalid;
            report.issues.push('Conflicting values for the same collection identity.');
            return output();
          }
          if (!records.has(key) && records.size >= this.policy.maxItems)
            return partial('Item limit reached.');
          records.set(key, record);
        }
        if (page.ended) {
          report.quality = records.size ? ExtractionQuality.Complete : ExtractionQuality.Empty;
          report.coverage = records.size ? ExtractionQuality.Complete : ExtractionQuality.Empty;
          if (options.captureScreenshot) {
            try {
              snapshot.screenshot = await session.screenshot();
              if (!snapshot.screenshot)
                report.issues.push('Optional screenshot unavailable for this transport.');
            } catch {
              report.issues.push('Optional screenshot unavailable.');
            }
          }
          return output();
        }
        const pagination = plan.strategy.pagination!;
        if (index + 1 >= this.policy.maxPages || actions >= this.policy.maxActions)
          return partial('Pagination limit reached.');
        actions++;
        const before = new Set(observedIdentities);
        if (pagination.kind === 'link') {
          const nextUrl = page.nextUrl;
          if (!nextUrl || new URL(nextUrl).origin !== origin || seenUrls.has(nextUrl))
            return partial(
              'Pagination URL is missing, repeated or outside the allowed origin.',
              FailureCode.NoProgress
            );
          seenUrls.add(snapshot.url);
          seenUrls.add(nextUrl);
          await session.close();
          session = await this.adapters[plan.strategy.transport].open(
            nextUrl,
            plan,
            context,
            options
          );
          await initialize();
        } else await session.advance(pagination);
        const hasProgress = (item: PageExtraction) =>
          item.ended ||
          (isAcceptedExtractionQuality(item.quality) &&
            item.observedIdentities.some((identity) => !before.has(identity)));
        page = await waitPage(hasProgress, this.policy.actionTimeoutMs);
        if (!hasProgress(page))
          return partial(
            'No new identities or completion evidence after pagination.',
            FailureCode.NoProgress
          );
      }
      return partial('Page limit reached.');
    } catch (error) {
      if (!records.size) throw error;
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
