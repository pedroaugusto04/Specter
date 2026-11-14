import { canonicalJson } from '../utils/diffHasher.js';
import { classifyAccessFailure } from '../acquisition/failure.js';
import { ExtractionQuality, TraceStatus, isAcceptedExtractionQuality } from './constants.js';
import { DomainError } from '../errors/domainErrors.js';
import type {
  DocumentAdapter,
  ExtractionIntent,
  ExtractionPlan,
  SemanticReview,
  StageTrace,
} from './contracts.js';
import type { ConfigurationModel, StageInput } from './model.js';
import type { IExtractionExecutor, ExecutionResult } from './executor.js';
import { createExecutionContext } from './context.js';
import { extractionPlanSchema, normalizeSingleFieldSources } from '../types/extractionPlan.js';
import { redactObject, redactText } from './evidence.js';
import { observationPacket } from './configurationTools.js';
import { logger } from '../utils/logger.js';
import { ConfigurationSession } from './configurationSession.js';
import { ConfigurationProgress, sameIntent } from './configurationPolicy.js';
import { ConfigurationFailure } from './configurationFailure.js';
import { reviewConfiguration } from './configurationReview.js';
import {
  ConfigurationDecisionKind,
  ConfigurationToolKind,
  ConfigurationStage,
  ConfigurationErrorCode,
} from './configurationConstants.js';

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
export interface IConfigurationPipeline {
  configure(request: ConfigurationRequest): Promise<ConfigurationResult>;
}
export interface ConfigurationOptions {
  budgetMs: number;
  maxAttempts: number;
  maxDecisions: number;
  evidenceLimit: number;
  reviewReserveMs: number;
  semanticEnabled: boolean;
  semanticThreshold: number;
}

export class ConfigurationPipeline implements IConfigurationPipeline {
  constructor(
    private readonly model: ConfigurationModel,
    private readonly browser: DocumentAdapter,
    private readonly executor: IExtractionExecutor,
    private readonly options: ConfigurationOptions
  ) {}

  async configure(request: ConfigurationRequest): Promise<ConfigurationResult> {
    const context = createExecutionContext(this.options.budgetMs);
    const reserve = this.options.semanticEnabled ? this.options.reviewReserveMs : 0;
    if (reserve >= this.options.budgetMs)
      throw new ConfigurationFailure(
        'Review reserve must be smaller than the configuration budget.',
        []
      );
    const work = createExecutionContext(
      Math.max(1, this.options.budgetMs - reserve),
      context.signal
    );
    const trace: StageTrace[] = [];
    const history: unknown[] = [];
    let attempts = 0;
    let feedback = '';
    const progress = new ConfigurationProgress();
    const rejected = new Set<string>();
    const fail = (message: string, review?: SemanticReview): never => {
      throw new ConfigurationFailure(message, trace, review);
    };
    const run = async <T>(stage: string, action: () => Promise<T>): Promise<T> => {
      const started = Date.now();
      const stageContext = stage === ConfigurationStage.Semantic ? context : work;
      try {
        stageContext.check();
        const result = await action();
        stageContext.check();
        trace.push({ stage, durationMs: Date.now() - started, status: TraceStatus.Success });
        logger.info('Configuration operation completed', {
          jobId: request.jobId,
          stage,
          durationMs: Date.now() - started,
          status: TraceStatus.Success,
        });
        return result;
      } catch (error) {
        trace.push({ stage, durationMs: Date.now() - started, status: TraceStatus.Failed });
        logger.warn('Configuration operation failed', {
          jobId: request.jobId,
          stage,
          durationMs: Date.now() - started,
          errorCode:
            error instanceof DomainError ? error.code : ConfigurationErrorCode.OperationFailed,
        });
        throw error;
      }
    };
    const session = new ConfigurationSession(this.browser, request, work, run);
    const input = (evidence: string, review = false): StageInput => ({
      jobId: request.jobId,
      url: request.url,
      prompt: request.prompt,
      evidence,
      timeoutMs: review ? context.remaining() : work.remaining(),
      signal: review ? context.signal : work.signal,
    });
    try {
      let snapshot = await session.snapshot();
      for (let decisionIndex = 0; decisionIndex < this.options.maxDecisions; decisionIndex++) {
        work.check();
        // The model adapter packs the exact input budget and preserves authoritative inputs.
        const available = this.options.evidenceLimit;
        const observationBudget = history.length
          ? Math.max(1000, Math.floor(available * 0.65))
          : available;
        const evidence = JSON.stringify({
          feedback: redactText(feedback),
          observation: observationPacket(snapshot, observationBudget),
          history: redactObject([...history].reverse()),
        });
        try {
          const decision = await run(ConfigurationStage.Configure, () =>
            this.model.decide(input(evidence), request.intent)
          );
          if (decision.kind === ConfigurationDecisionKind.Tool) {
            try {
              const result = await run('tool:' + decision.tool.kind, () =>
                session.execute(decision.tool)
              );
              const isScopedOrInteractive =
                decision.tool.kind === ConfigurationToolKind.Inspect ||
                decision.tool.kind === ConfigurationToolKind.Interact;
              const state = isScopedOrInteractive
                ? [result.result, result.snapshot.html, result.snapshot.responses]
                : result.result;
              if (!progress.observe(decision.tool, state))
                fail('Repeated operation without progress.');
              // Inspection is a scoped observation, not a replacement of the browser state.
              snapshot = await session.snapshot();
              history.push({
                id: decisionIndex,
                tool: decision.tool,
                result: redactObject(result.result),
                ...(isScopedOrInteractive
                  ? {
                      evidence: observationPacket(
                        result.snapshot,
                        Math.max(500, Math.floor(available * 0.2))
                      ),
                    }
                  : {}),
              });
              feedback = '';
            } catch (error) {
              if (
                error instanceof ConfigurationFailure ||
                classifyAccessFailure(error) ||
                work.signal.aborted
              )
                throw error;
              if (!progress.observe(decision.tool, String(error)))
                fail('Repeated operation without progress.');
              history.push({
                id: decisionIndex,
                tool: decision.tool,
                error: redactText(String(error)),
              });
              feedback = 'Tool failed: ' + redactText(String(error));
            }
            continue;
          }
          progress.reset();
          attempts++;
          const plan = extractionPlanSchema.parse(normalizeSingleFieldSources(decision.plan));
          if (request.intent && !sameIntent(request.intent, plan.intent))
            fail('Recovery cannot change extraction intent.');
          const key = canonicalJson(plan);
          if (rejected.has(key))
            fail('Repeated rejected extraction strategy. Previous failure: ' + feedback);
          rejected.add(key);
          // Release browser capacity before fresh validation; reopen/replay only if repair needs it.
          await session.close();
          const execution = await run(ConfigurationStage.Validation, () =>
            this.executor.execute(request.url, plan, {
              timeoutMs: work.remaining(),
              signal: work.signal,
              storageState: request.storageState,
              captureScreenshot: request.captureScreenshot,
            })
          );
          if (!isAcceptedExtractionQuality(execution.report.quality)) {
            history.push({
              id: decisionIndex,
              validation: redactObject({
                records: plan.strategy.records,
                identityFields: plan.intent.identityFields,
                quality: execution.report.quality,
                issues: execution.report.issues.slice(0, 8),
                sourcesUsed: execution.report.sourcesUsed,
                evidence: execution.report.evidence?.slice(0, 8),
              }),
            });
            throw new Error(execution.report.issues.join(' '));
          }
          if (
            !request.intent &&
            execution.report.quality === ExtractionQuality.Empty &&
            !execution.report.validatedSourceRecords
          )
            throw new Error('An initially empty collection cannot validate field sources.');
          const semanticReview = await reviewConfiguration({
            model: this.model,
            enabled: this.options.semanticEnabled,
            threshold: this.options.semanticThreshold,
            intent: plan.intent,
            execution,
            stageInput: input('', true),
            evidenceLimit: available,
            trace,
            run,
          });
          execution.report.semanticReview = semanticReview;
          execution.report.trace = [...trace, ...(execution.report.trace ?? [])];
          return { plan, execution, semanticReview, trace };
        } catch (error) {
          if (
            error instanceof ConfigurationFailure ||
            classifyAccessFailure(error) ||
            (error instanceof DomainError && error.isRetryable) ||
            work.signal.aborted
          )
            throw error;
          feedback = redactText(
            error instanceof Error ? error.message : String(error),
            this.options.evidenceLimit / 4
          );
          history.push({ id: decisionIndex, rejection: feedback });
          if (attempts >= this.options.maxAttempts) fail(feedback);
          snapshot = await session.snapshot();
        }
      }
      return fail(feedback || 'Configuration decision budget exhausted.');
    } catch (error) {
      if (work.signal.aborted || context.signal.aborted) fail('Configuration deadline exhausted.');
      throw error;
    } finally {
      await session.close();
    }
  }
}
