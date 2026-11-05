import { discoverWithCapabilities } from './capabilities.js';
import { classifyAccessFailure } from '../acquisition/failure.js';
import {
  ExtractionMode,
  ExtractionQuality,
  SemanticReviewStatus,
  SourceKind,
  TraceStatus,
  Transport,
  isAcceptedExtractionQuality,
} from './constants.js';
import { DomainError } from '../errors/domainErrors.js';
import type {
  DocumentAdapter,
  DocumentSnapshot,
  ExtractionIntent,
  ExtractionPlan,
  SemanticReview,
  StageTrace,
} from './contracts.js';
import type { ConfigurationStages, StageInput } from './model.js';
import type { IExtractionExecutor, ExecutionResult } from './executor.js';
import { createExecutionContext } from './context.js';
import { extractionPlanSchema } from '../types/extractionPlan.js';
import { redactObject, redactText } from './evidence.js';
import { buildCompilerEvidence } from '../utils/compilerEvidence.js';
import { sortObjectKeys } from '../utils/diffHasher.js';
import { logger } from '../utils/logger.js';

export interface ConfigurationRequest {
  jobId: string;
  url: string;
  prompt: string;
  intent?: ExtractionIntent;
  storageState?: unknown;
  captureScreenshot?: boolean;
}

export interface ConfigurationResult {
  plan: ExtractionPlan;
  execution: ExecutionResult;
  semanticReview: SemanticReview;
  trace: StageTrace[];
}

export class ConfigurationFailure extends DomainError {
  constructor(
    message: string,
    readonly trace: StageTrace[],
    readonly semanticReview?: SemanticReview
  ) {
    super(message, { code: 'CONFIGURATION_REJECTED', statusCode: 422, isRetryable: false });
  }
}

export interface IConfigurationPipeline {
  configure(request: ConfigurationRequest): Promise<ConfigurationResult>;
}

export interface ConfigurationOptions {
  budgetMs: number;
  maxAttempts: number;
  maxDiscoveryActions: number;
  evidenceLimit: number;
  semanticEnabled: boolean;
  semanticThreshold: number;
}
/** Orchestrates independent stage ports; owns neither model nor browser implementations. */
export class ConfigurationPipeline implements IConfigurationPipeline {
  constructor(
    private readonly stages: ConfigurationStages,
    private readonly browser: DocumentAdapter,
    private readonly executor: IExtractionExecutor,
    private readonly options: ConfigurationOptions
  ) {}
  async configure(request: ConfigurationRequest): Promise<ConfigurationResult> {
    const context = createExecutionContext(this.options.budgetMs);
    const trace: StageTrace[] = [];
    const run = async <T>(stage: string, action: () => Promise<T>): Promise<T> => {
      context.check();
      const started = Date.now();
      try {
        const result = await action();
        const durationMs = Date.now() - started;
        trace.push({ stage, durationMs, status: TraceStatus.Success });
        logger.info('Configuration stage completed', {
          jobId: request.jobId,
          stage,
          durationMs,
          status: TraceStatus.Success,
        });
        return result;
      } catch (error) {
        const durationMs = Date.now() - started;
        trace.push({
          stage,
          durationMs,
          status: TraceStatus.Failed,
          code: 'STAGE_ERROR',
        });
        logger.warn('Configuration stage failed', {
          jobId: request.jobId,
          stage,
          durationMs,
          status: TraceStatus.Failed,
          errorCode:
            error && typeof error === 'object' && 'code' in error
              ? String(error.code)
              : error instanceof Error && error.name === 'ZodError'
                ? 'MODEL_VALIDATION_ERROR'
                : 'STAGE_ERROR',
          errorMessage: error instanceof Error ? error.message : String(error),
          validationIssues:
            error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)
              ? error.issues.map((issue) => ({
                  code: issue.code,
                  path: issue.path,
                  message: issue.message,
                }))
              : undefined,
        });
        throw error;
      }
    };
    const seed: ExtractionPlan = {
      version: 3,
      intent: request.intent ?? {
        entity: request.prompt,
        fields: {},
        filters: [],
        identityFields: [],
        mode: ExtractionMode.Single,
        scope: 'page',
        triggerRules: [],
        triggerMatchMode: 'all',
      },
      strategy: {
        transport: Transport.Browser,
        records: { kind: SourceKind.Dom, selector: 'body' },
        fields: {},
        ready: [{ kind: 'exists', locator: { kind: 'css', selector: 'body' } }],
        empty: [],
      },
    };
    let evidence = '';
    let discoveryActions = 0;
    let intent = request.intent;
    const input = (): StageInput => ({
      jobId: request.jobId,
      url: request.url,
      prompt: request.prompt,
      evidence,
      timeoutMs: context.remaining(),
    });
    const session = await run('acquisition', () =>
      this.browser.open(request.url, seed, context, { storageState: request.storageState })
    );
    try {
      const snapshots = [await session.snapshot()];
      evidence = this.evidence(snapshots);
      intent ??= await run('intent', () => this.stages.interpreter.interpret(input()));
      const frozenIntent = intent;
      for (let step = 0; step < this.options.maxDiscoveryActions; step++) {
        const action = await run('discovery', () =>
          this.stages.discovery.next(input(), frozenIntent)
        );
        if (!action) break;
        discoveryActions++;
        snapshots.push(await run('interaction', () => discoverWithCapabilities(session, action)));
        evidence = this.evidence(snapshots);
      }
    } finally {
      await session.close();
    }
    const fixedIntent = intent;
    let feedback = '';
    let lastReview: SemanticReview | undefined;
    for (let attempt = 0; attempt < this.options.maxAttempts; attempt++) {
      context.check();
      try {
        const strategy = await run('plan', () =>
          this.stages.generator.generate(input(), fixedIntent, feedback)
        );
        const parsedPlan = extractionPlanSchema.safeParse({
          version: 3,
          intent: fixedIntent,
          strategy,
        });
        if (!parsedPlan.success) {
          logger.diagnostic('Extraction plan rejected by schema', {
            jobId: request.jobId,
            attempt: attempt + 1,
            strategy,
            validationIssues: parsedPlan.error.issues,
          });
          const expectedFields = Object.keys(fixedIntent.fields).sort();
          const actualFields =
            strategy &&
            typeof strategy === 'object' &&
            'fields' in strategy &&
            strategy.fields &&
            typeof strategy.fields === 'object'
              ? Object.keys(strategy.fields).sort()
              : [];
          const missingFields = expectedFields.filter((field) => !actualFields.includes(field));
          const unexpectedFields = actualFields.filter((field) => !expectedFields.includes(field));
          logger.warn('Generated extraction strategy failed schema validation', {
            jobId: request.jobId,
            stage: 'plan-validation',
            attempt: attempt + 1,
            maxAttempts: this.options.maxAttempts,
            issueMessages: parsedPlan.error.issues.map((issue) => issue.message),
            expectedFields,
            actualFields,
            missingFields,
            unexpectedFields,
          });
          const fieldFeedback =
            missingFields.length || unexpectedFields.length
              ? ` Field keys must exactly match the fixed intent. Expected keys: ${JSON.stringify(expectedFields)}. Actual keys: ${JSON.stringify(actualFields)}. Keep the expected keys unchanged; map them to matching page content regardless of page language.`
              : '';
          throw new Error(
            parsedPlan.error.issues.map((issue) => issue.message).join(' ') + fieldFeedback
          );
        }
        const plan = parsedPlan.data;
        logger.diagnostic('Extraction plan accepted by schema', {
          jobId: request.jobId,
          attempt: attempt + 1,
          plan,
        });
        const execution = await run('validation', () =>
          this.executor.execute(request.url, plan, {
            timeoutMs: context.remaining(),
            signal: context.signal,
            storageState: request.storageState,
            captureScreenshot: request.captureScreenshot,
          })
        );
        logger.diagnostic('Extraction execution result', {
          jobId: request.jobId,
          attempt: attempt + 1,
          data: execution.data,
          report: execution.report,
          snapshot: {
            url: redactText(execution.snapshot.url),
            transport: execution.snapshot.transport,
            httpStatus: execution.snapshot.httpStatus,
          },
        });
        if (!isAcceptedExtractionQuality(execution.report.quality))
          throw new Error(execution.report.issues.join(' '));
        if (
          !request.intent &&
          execution.report.quality === ExtractionQuality.Empty &&
          !execution.report.validatedSourceRecords
        )
          throw new Error('An initially empty collection cannot validate field sources.');
        const enabled = this.options.semanticEnabled;
        const threshold = this.options.semanticThreshold;
        let semanticReview: SemanticReview = {
          status: SemanticReviewStatus.Skipped,
          score: null,
          reasons: ['Semantic review disabled.'],
          evidenceRefs: [],
        };
        if (enabled) {
          try {
            const review = await run('semantic', () =>
              this.stages.reviewer.review(input(), fixedIntent, {
                data: execution.data,
                provenance: execution.report.evidence,
                coverage: execution.report.coverage,
              })
            );
            semanticReview = {
              ...review,
              status:
                review.score < threshold
                  ? SemanticReviewStatus.Rejected
                  : review.score < 7
                    ? SemanticReviewStatus.Warning
                    : SemanticReviewStatus.Passed,
            };
          } catch (error) {
            logger.warn('Semantic review failed after deterministic validation', {
              jobId: request.jobId,
              attempt: attempt + 1,
              errorCode:
                error && typeof error === 'object' && 'code' in error
                  ? String(error.code)
                  : error instanceof Error && error.name === 'ZodError'
                    ? 'MODEL_VALIDATION_ERROR'
                    : 'SEMANTIC_REVIEW_ERROR',
              errorMessage: error instanceof Error ? error.message : String(error),
            });
            logger.diagnostic(
              'Semantic review failed; deterministic validation remains authoritative',
              {
                jobId: request.jobId,
                attempt: attempt + 1,
                errorName: error instanceof Error ? error.name : 'UnknownError',
                errorMessage: error instanceof Error ? error.message : String(error),
              }
            );
            semanticReview = {
              status: SemanticReviewStatus.Error,
              score: null,
              reasons: [
                'Semantic reviewer unavailable or invalid response; deterministic checks passed.',
              ],
              evidenceRefs: [],
            };
          }
        } else trace.push({ stage: 'semantic', durationMs: 0, status: TraceStatus.Skipped });
        lastReview = semanticReview;
        trace.push({
          stage: 'semantic-policy',
          durationMs: 0,
          status:
            semanticReview.status === SemanticReviewStatus.Rejected
              ? TraceStatus.Failed
              : semanticReview.status === SemanticReviewStatus.Skipped
                ? TraceStatus.Skipped
                : TraceStatus.Success,
          code:
            semanticReview.status +
            (semanticReview.score === null ? '' : '_' + semanticReview.score),
        });
        logger.diagnostic('Semantic review policy result', {
          jobId: request.jobId,
          attempt: attempt + 1,
          review: semanticReview,
        });
        if (semanticReview.status === SemanticReviewStatus.Rejected)
          throw new Error(
            'Semantic review rejected candidate: ' + semanticReview.reasons.join(' ')
          );
        execution.report.semanticReview = semanticReview;
        execution.report.trace = [...trace, ...(execution.report.trace ?? [])];
        return { plan, execution, semanticReview, trace };
      } catch (error) {
        if (classifyAccessFailure(error)) throw error;
        feedback = error instanceof Error ? error.message : 'Candidate validation failed.';
        logger.diagnostic('Extraction candidate rejected', {
          jobId: request.jobId,
          attempt: attempt + 1,
          maxAttempts: this.options.maxAttempts,
          feedback,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          trace: trace.slice(-8),
        });
        if (
          attempt + 1 < this.options.maxAttempts &&
          discoveryActions < this.options.maxDiscoveryActions
        ) {
          const retrySession = await run('acquisition', () =>
            this.browser.open(request.url, { ...seed, intent: fixedIntent }, context, {
              storageState: request.storageState,
            })
          );
          try {
            const retryInput = {
              ...input(),
              evidence: evidence + '\nValidation feedback: ' + JSON.stringify(feedback),
            };
            const action = await run('discovery', () =>
              this.stages.discovery.next(retryInput, fixedIntent)
            );
            if (action) {
              discoveryActions++;
              evidence +=
                '\nAdditional evidence:\n' +
                this.evidence([
                  await run('interaction', () => discoverWithCapabilities(retrySession, action)),
                ]);
              evidence = evidence.slice(-this.options.evidenceLimit);
            }
          } finally {
            await retrySession.close();
          }
        }
      }
    }
    throw new ConfigurationFailure(
      feedback || 'Configuration budget exhausted.',
      trace,
      lastReview
    );
  }

  private evidence(snapshots: DocumentSnapshot[]): string {
    const perSnapshot = Math.max(1, Math.floor(this.options.evidenceLimit / snapshots.length));
    return snapshots
      .map(
        (snapshot, index) =>
          'Snapshot ' +
          index +
          ' (transport ' +
          (snapshot.transport ?? 'unknown') +
          '): ' +
          redactText(snapshot.url) +
          '\n' +
          buildCompilerEvidence(snapshot.html, Math.floor(perSnapshot * 0.7)) +
          '\nObserved responses: ' +
          JSON.stringify(redactObject(snapshot.responses)).slice(0, Math.floor(perSnapshot * 0.3))
      )
      .join('\n')
      .slice(0, this.options.evidenceLimit);
  }
}

export function sameIntent(a: ExtractionIntent, b: ExtractionIntent): boolean {
  return JSON.stringify(sortObjectKeys(a)) === JSON.stringify(sortObjectKeys(b));
}
