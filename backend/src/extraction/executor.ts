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
export interface IExtractionExecutor {
  execute(
    url: string,
    plan: ExtractionPlan,
    options?: {
      timeoutMs?: number;
      signal?: AbortSignal;
      storageState?: unknown;
      captureScreenshot?: boolean;
    }
  ): Promise<ExecutionResult>;
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
    options: {
      timeoutMs?: number;
      signal?: AbortSignal;
      storageState?: unknown;
      captureScreenshot?: boolean;
    } = {}
  ): Promise<ExecutionResult> {
    const started = Date.now();
    const context = createExecutionContext(
      Math.min(this.policy.timeoutMs, options.timeoutMs ?? this.policy.timeoutMs),
      options.signal
    );
    const observedIdentities = new Set<string>();
    const records = new Map<string, Record<string, Scalar>>();
    const report: ExtractionReport = {
      quality: 'INCONCLUSIVE',
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
        plan.intent.mode === 'single'
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
      snapshot = await session!.snapshot();
      if (snapshot.httpStatus >= 400) throw new UpstreamHttpError(snapshot.httpStatus);
      if (new URL(snapshot.url).origin !== origin)
        throw new Error('Navigation escaped the original origin.');
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
    const partial = (issue: string, code: ExtractionReport['failureCode'] = 'LIMIT') => {
      report.failureCode = code;
      report.quality = 'PARTIAL';
      report.coverage = 'PARTIAL';
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
        status: 'SUCCESS',
      });
      await initialize();
      let page = await waitPage((item) => item.ready, this.policy.actionTimeoutMs);
      for (let index = 0; index < this.policy.maxPages; index++) {
        context.check();
        report.pagesVisited++;
        report.trace!.push({
          stage: 'page-' + report.pagesVisited,
          durationMs: 0,
          status: ['COMPLETE', 'EMPTY'].includes(page.quality) ? 'SUCCESS' : 'FAILED',
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
        if (!['COMPLETE', 'EMPTY'].includes(page.quality)) {
          report.failureCode = page.ready ? 'SOURCE' : 'READINESS';
          report.integrity = page.quality === 'INVALID' ? 'INVALID' : 'VALID';
          return output();
        }
        for (const record of page.records) {
          const key = recordIdentity(record, plan.intent.identityFields);
          if (records.has(key) && JSON.stringify(records.get(key)) !== JSON.stringify(record)) {
            report.quality = 'INVALID';
            report.integrity = 'INVALID';
            report.issues.push('Conflicting values for the same collection identity.');
            return output();
          }
          if (!records.has(key) && records.size >= this.policy.maxItems)
            return partial('Item limit reached.');
          records.set(key, record);
        }
        if (page.ended) {
          report.quality = records.size ? 'COMPLETE' : 'EMPTY';
          report.coverage = records.size ? 'COMPLETE' : 'EMPTY';
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
              'NO_PROGRESS'
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
        page = await waitPage(
          (item) =>
            item.ended ||
            (['COMPLETE', 'EMPTY'].includes(item.quality) &&
              item.observedIdentities.some((identity) => !before.has(identity))),
          this.policy.actionTimeoutMs
        );
        const progressed =
          page.ended ||
          (['COMPLETE', 'EMPTY'].includes(page.quality) &&
            page.observedIdentities.some((identity) => !before.has(identity)));
        if (!progressed)
          return partial(
            'No new identities or completion evidence after pagination.',
            'NO_PROGRESS'
          );
      }
      return partial('Page limit reached.');
    } catch (error) {
      if (!records.size) throw error;
      return partial(
        error instanceof Error ? error.message : 'Execution interrupted.',
        context.signal.aborted ? 'TIMEOUT' : 'NAVIGATION'
      );
    } finally {
      await session?.close();
      report.trace!.push({
        stage: 'extraction',
        durationMs: Date.now() - started,
        status: ['COMPLETE', 'EMPTY'].includes(report.quality) ? 'SUCCESS' : 'FAILED',
        code: report.quality,
      });
    }
  }
}
