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
import { redactText } from './evidence.js';
import { observationPacket } from './configurationTools.js';
import { logger } from '../utils/logger.js';
import { ConfigurationSession } from './configurationSession.js';
import { ConfigurationProgress, sameIntent } from './configurationPolicy.js';
import { ConfigurationFailure } from './configurationFailure.js';
import { reviewConfiguration } from './configurationReview.js';
import {
  ConfigurationDecisionKind,
  ConfigurationStage,
  ConfigurationErrorCode,
} from './configurationConstants.js';
import type { ConfigurationTool } from './configurationSchemas.js';
import {
  buildObservationEvidence,
  buildValidationHistoryEntry,
  countToolHistory,
  isScopedOrInteractiveTool,
  precheckCandidatePlanInSnapshot,
} from './configurationHelpers.js';

export interface ConfigurationRequest {
  jobId: string;
  url: string;
  prompt: string;
  intent?: ExtractionIntent;
  storageState?: unknown;
  captureScreenshot?: boolean;
  signal?: AbortSignal;
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
    const context = createExecutionContext(this.options.budgetMs, request.signal);
    const reserve = this.options.semanticEnabled ? this.options.reviewReserveMs : 0;
    if (reserve >= this.options.budgetMs) {
      throw new ConfigurationFailure(
        'Review reserve must be smaller than the configuration budget.',
        []
      );
    }

    const work = createExecutionContext(
      Math.max(1, this.options.budgetMs - reserve),
      context.signal
    );
    const trace: StageTrace[] = [];
    const history: unknown[] = [];
    const rejected = new Set<string>();
    const progress = new ConfigurationProgress();

    let attempts = 0;
    let feedback = '';

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
    const buildStageInput = (evidence: string, review = false): StageInput => ({
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
        const available = this.options.evidenceLimit;
        const evidence = buildObservationEvidence({
          snapshot,
          history,
          feedback,
          availableLimit: available,
        });

        try {
          const decision = await run(ConfigurationStage.Configure, () =>
            this.model.decide(buildStageInput(evidence), request.intent)
          );

          if (decision.kind === ConfigurationDecisionKind.Tool) {
            feedback = await this.handleToolDecision({
              tool: decision.tool,
              session,
              progress,
              history,
              decisionIndex,
              availableLimit: available,
              run,
              work,
              fail,
            });
            snapshot = await session.snapshot();
            continue;
          }

          // Candidate branch
          progress.reset();
          attempts++;

          const plan = extractionPlanSchema.parse(normalizeSingleFieldSources(decision.plan));
          if (request.intent && !sameIntent(request.intent, plan.intent)) {
            fail('Recovery cannot change extraction intent.');
          }

          const planKey = canonicalJson(plan);
          if (rejected.has(planKey)) {
            fail('Repeated rejected extraction strategy. Previous failure: ' + feedback);
          }
          rejected.add(planKey);

          // Fast in-memory sanity check: verify DOM record container exists in observed snapshot
          const precheck = precheckCandidatePlanInSnapshot(plan, snapshot);
          if (!precheck.valid) {
            history.push({ id: decisionIndex, rejection: precheck.rejection });
            feedback = precheck.rejection!;
            if (attempts >= this.options.maxAttempts) fail(feedback);
            continue;
          }

          // Release browser capacity before fresh validation
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
            history.push(buildValidationHistoryEntry(decisionIndex, plan, execution));
            throw new Error(execution.report.issues.join(' '));
          }

          if (
            !request.intent &&
            execution.report.quality === ExtractionQuality.Empty &&
            !execution.report.validatedSourceRecords
          ) {
            throw new Error('An initially empty collection cannot validate field sources.');
          }

          const semanticReview = await reviewConfiguration({
            model: this.model,
            enabled: this.options.semanticEnabled,
            threshold: this.options.semanticThreshold,
            intent: plan.intent,
            execution,
            stageInput: buildStageInput('', true),
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
          ) {
            throw error;
          }

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
      if (work.signal.aborted || context.signal.aborted) {
        fail('Configuration deadline exhausted.');
      }
      throw error;
    } finally {
      await session.close();
    }
  }

  private async handleToolDecision(params: {
    tool: ConfigurationTool;
    session: ConfigurationSession;
    progress: ConfigurationProgress;
    history: unknown[];
    decisionIndex: number;
    availableLimit: number;
    run: <T>(stage: string, action: () => Promise<T>) => Promise<T>;
    work: ReturnType<typeof createExecutionContext>;
    fail: (message: string) => never;
  }): Promise<string> {
    const { tool, session, progress, history, decisionIndex, availableLimit, run, work, fail } =
      params;
    const currentToolCount = countToolHistory(history);

    if (currentToolCount >= 5) {
      const limitNotice = `Observation budget limit reached (${currentToolCount} tools executed). Do not make further tool calls; emit kind 'candidate' with your best extraction plan now.`;
      history.push({ id: decisionIndex, rejection: limitNotice });
      return limitNotice;
    }

    try {
      const result = await run('tool:' + tool.kind, () => session.execute(tool));
      const isScoped = isScopedOrInteractiveTool(tool.kind);
      const state = isScoped
        ? [result.result, result.snapshot.html, result.snapshot.responses]
        : result.result;

      if (!progress.observe(tool, state)) {
        fail('Repeated operation without progress.');
      }

      history.push({
        id: decisionIndex,
        tool,
        result: result.result,
        ...(isScoped
          ? {
              evidence: observationPacket(
                result.snapshot,
                Math.max(500, Math.floor(availableLimit * 0.2))
              ),
            }
          : {}),
      });

      return '';
    } catch (error) {
      if (
        error instanceof ConfigurationFailure ||
        classifyAccessFailure(error) ||
        work.signal.aborted
      ) {
        throw error;
      }

      if (!progress.observe(tool, String(error))) {
        fail('Repeated operation without progress.');
      }

      history.push({
        id: decisionIndex,
        tool,
        error: redactText(String(error)),
      });

      return 'Tool failed: ' + redactText(String(error));
    }
  }
}
