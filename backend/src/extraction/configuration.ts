import { DomainError } from '../errors/domainErrors.js';
import type {
  DocumentAdapter,
  DocumentSnapshot,
  ExtractionIntent,
  ExtractionPlan,
  SemanticPolicy,
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
export interface ConfigurationRequest {
  jobId: string;
  url: string;
  prompt: string;
  intent?: ExtractionIntent;
  semanticPolicy?: SemanticPolicy;
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
        trace.push({ stage, durationMs: Date.now() - started, status: 'SUCCESS' });
        return result;
      } catch (error) {
        trace.push({
          stage,
          durationMs: Date.now() - started,
          status: 'FAILED',
          code: 'STAGE_ERROR',
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
        mode: 'single',
        scope: 'page',
        triggerRules: [],
        triggerMatchMode: 'all',
      },
      strategy: {
        transport: 'browser',
        records: { kind: 'dom', selector: 'body' },
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
        snapshots.push(await run('interaction', () => session.discover(action)));
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
        const plan = extractionPlanSchema.parse({ version: 3, intent: fixedIntent, strategy });
        const execution = await run('validation', () =>
          this.executor.execute(request.url, plan, {
            timeoutMs: context.remaining(),
            storageState: request.storageState,
            captureScreenshot: request.captureScreenshot,
          })
        );
        if (!['COMPLETE', 'EMPTY'].includes(execution.report.quality))
          throw new Error(execution.report.issues.join(' '));
        if (
          !request.intent &&
          execution.report.quality === 'EMPTY' &&
          !execution.report.validatedSourceRecords
        )
          throw new Error('An initially empty collection cannot validate field sources.');
        const enabled = request.semanticPolicy?.enabled ?? this.options.semanticEnabled;
        const threshold = request.semanticPolicy?.threshold ?? this.options.semanticThreshold;
        let semanticReview: SemanticReview = {
          status: 'SKIPPED',
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
                review.score < threshold ? 'REJECTED' : review.score < 7 ? 'WARNING' : 'PASSED',
            };
          } catch {
            semanticReview = {
              status: 'ERROR',
              score: null,
              reasons: [
                'Semantic reviewer unavailable or invalid response; deterministic checks passed.',
              ],
              evidenceRefs: [],
            };
          }
        } else trace.push({ stage: 'semantic', durationMs: 0, status: 'SKIPPED' });
        lastReview = semanticReview;
        trace.push({
          stage: 'semantic-policy',
          durationMs: 0,
          status:
            semanticReview.status === 'REJECTED'
              ? 'FAILED'
              : semanticReview.status === 'SKIPPED'
                ? 'SKIPPED'
                : 'SUCCESS',
          code:
            semanticReview.status +
            (semanticReview.score === null ? '' : '_' + semanticReview.score),
        });
        if (semanticReview.status === 'REJECTED')
          throw new Error(
            'Semantic review rejected candidate: ' + semanticReview.reasons.join(' ')
          );
        execution.report.semanticReview = semanticReview;
        execution.report.trace = [...trace, ...(execution.report.trace ?? [])];
        return { plan, execution, semanticReview, trace };
      } catch (error) {
        feedback = error instanceof Error ? error.message : 'Candidate validation failed.';
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
                this.evidence([await run('interaction', () => retrySession.discover(action))]);
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
