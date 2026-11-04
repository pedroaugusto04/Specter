import { buildChangeAlert } from '../utils/changeAlertHelper.js';
import { computeExtractionHash, sortObjectKeys } from '../utils/diffHasher.js';
import { ConfigurationPipeline } from './configuration.js';
import { evaluateCondition } from './conditions.js';
import { ExtractionExecutor } from './executor.js';
import { PageExtractor } from './pageExtractor.js';
import { standardSourceReaders } from './sources.js';
import { createModelStages } from './modelStages.js';
import { extractionIntentSchema, executionStrategySchema } from '../types/extractionPlan.js';
import type { DocumentAdapter, DocumentSnapshot, ExtractionPlan, Scalar } from './contracts.js';
import type { ConfigurationRequest } from './configuration.js';
import type { IModelProvider, ModelInput } from './model.js';
import type { ExecutionPolicy } from './contracts.js';
import type { ExtractedPayload } from '../types/extractor.js';
import { ExtractionMode } from './constants.js';

export interface ConfigurationEvaluationCase {
  name: string;
  prompt: string;
  snapshot: DocumentSnapshot;
  discoverySnapshots?: DocumentSnapshot[];
  responses: {
    intent: unknown;
    discovery: unknown | unknown[];
    plan: unknown | unknown[];
    semantic: unknown;
  };
  expectedRecords: Record<string, Scalar>[];
  expectedQuality: 'COMPLETE' | 'EMPTY';
  expectedSemanticStatus?: string;
  previousRecords?: Record<string, Scalar>[];
  expectChange?: boolean;
}

export interface ConfigurationEvaluationReport {
  cases: number;
  fieldAccuracy: number;
  entityAccuracy: number;
  qualityAccuracy: number;
  falseAlerts: number;
  missedAlerts: number;
  modelCalls: number;
  modelDurationMs: number;
  modelCallsByTask: Record<string, { calls: number; failures: number; durationMs: number }>;
  stages: Record<string, { calls: number; failures: number; durationMs: number }>;
  durationMs: number;
  results: Array<{
    name: string;
    passed: boolean;
    quality: string;
    semanticStatus?: string;
    error?: string;
  }>;
}

const policy: ExecutionPolicy = {
  timeoutMs: 10000,
  navigationTimeoutMs: 10000,
  actionTimeoutMs: 100,
  pollIntervalMs: 50,
  maxPages: 5,
  maxActions: 10,
  maxItems: 100,
  maxEvidence: 100,
};

class FixtureModelProvider implements IModelProvider {
  readonly name = 'recorded-fixtures';
  private readonly offsets = new Map<string, number>();

  constructor(private readonly responses: ConfigurationEvaluationCase['responses']) {}

  async generate(input: ModelInput): Promise<unknown> {
    const response = this.responses[input.task];
    if (response === undefined) throw new Error(`Missing recorded response for ${input.task}.`);
    if (!Array.isArray(response)) return structuredClone(response);
    const offset = this.offsets.get(input.task) ?? 0;
    const selected = response[offset];
    if (selected === undefined) throw new Error(`No recorded response remains for ${input.task}.`);
    this.offsets.set(input.task, offset + 1);
    return structuredClone(selected);
  }
}

class CountingModelProvider implements IModelProvider {
  readonly name: string;
  readonly callsByTask: ConfigurationEvaluationReport['modelCallsByTask'] = {};

  constructor(private readonly provider: IModelProvider) {
    this.name = provider.name;
  }

  async generate(input: ModelInput): Promise<unknown> {
    const metric = (this.callsByTask[input.task] ??= { calls: 0, failures: 0, durationMs: 0 });
    metric.calls++;
    const started = Date.now();
    try {
      return await this.provider.generate(input);
    } catch (error) {
      metric.failures++;
      throw error;
    } finally {
      metric.durationMs += Date.now() - started;
    }
  }
}

function fixtureAdapter(
  snapshot: DocumentSnapshot,
  discoverySnapshots: DocumentSnapshot[] = []
): DocumentAdapter {
  return {
    async open() {
      let captured = structuredClone(snapshot);
      let discoveryIndex = 0;
      return {
        capabilities: { interactions: true, networkResponses: true, scopedDocuments: true },
        snapshot: async () => structuredClone(captured),
        check: async (condition) => evaluateCondition(condition, captured, []),
        advance: async () => {},
        discover: async () => {
          const next = discoverySnapshots[discoveryIndex++];
          if (next) captured = structuredClone(next);
          return structuredClone(captured);
        },
        screenshot: async () => undefined,
        close: async () => {},
      };
    },
  };
}

function asRecords(data: ExtractedPayload): Record<string, Scalar>[] {
  if ('items' in data && Array.isArray(data.items)) return data.items;
  return [data as Record<string, Scalar>];
}

function serialize(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function alertFor(
  item: ConfigurationEvaluationCase,
  plan: ExtractionPlan,
  currentRecords: Record<string, Scalar>[]
): boolean {
  if (!item.previousRecords) return false;
  const payload = (records: Record<string, Scalar>[]): ExtractedPayload =>
    plan.intent.mode === ExtractionMode.Single
      ? (records[0] ?? {})
      : { items: records, count: records.length };
  const current = payload(currentRecords);
  const previous = payload(item.previousRecords);
  return (
    computeExtractionHash(previous) !== computeExtractionHash(current) &&
    Boolean(
      buildChangeAlert({
        job: {
          id: item.name,
          userId: 'eval',
          url: item.snapshot.url,
          userPrompt: item.prompt,
          notificationEmail: '',
          extractionPlan: plan,
        },
        currentData: current,
        previousData: previous,
        triggerRules: plan.intent.triggerRules,
        triggerMatchMode: plan.intent.triggerMatchMode,
      })
    )
  );
}

export async function evaluateConfigurationCorpus(
  cases: ConfigurationEvaluationCase[],
  provider: IModelProvider | ((item: ConfigurationEvaluationCase) => IModelProvider)
): Promise<ConfigurationEvaluationReport> {
  const started = Date.now();
  const stageTotals: ConfigurationEvaluationReport['stages'] = {};
  const taskTotals: ConfigurationEvaluationReport['modelCallsByTask'] = {};
  let correctFields = 0;
  let totalFields = 0;
  let exactEntities = 0;
  let correctQuality = 0;
  let falseAlerts = 0;
  let missedAlerts = 0;

  const results = [];
  for (const item of cases) {
    totalFields += item.expectedRecords.reduce(
      (total, record) => total + Object.keys(record).length,
      0
    );
    const caseProvider = typeof provider === 'function' ? provider(item) : provider;
    const countedProvider = new CountingModelProvider(caseProvider);
    let quality = 'FAILED';
    let semanticStatus: string | undefined;
    let passed = false;
    let errorName: string | undefined;
    try {
      const pipeline = new ConfigurationPipeline(
        createModelStages(countedProvider),
        fixtureAdapter(item.snapshot, item.discoverySnapshots),
        new ExtractionExecutor(
          {
            http: fixtureAdapter(item.discoverySnapshots?.at(-1) ?? item.snapshot),
            browser: fixtureAdapter(item.discoverySnapshots?.at(-1) ?? item.snapshot),
          },
          new PageExtractor(standardSourceReaders()),
          policy
        ),
        {
          budgetMs: 30000,
          maxAttempts: 2,
          maxDiscoveryActions: 2,
          evidenceLimit: 5000,
          semanticEnabled: true,
          semanticThreshold: 4,
        }
      );
      const request: ConfigurationRequest = {
        jobId: `eval-${item.name}`,
        url: item.snapshot.url,
        prompt: item.prompt,
      };
      const result = await pipeline.configure(request);
      quality = result.execution.report.quality;
      semanticStatus = result.semanticReview.status;
      const actualRecords = asRecords(result.execution.data);
      const entitiesCorrect = serialize(actualRecords) === serialize(item.expectedRecords);
      const qualityCorrect = quality === item.expectedQuality;
      exactEntities += Number(entitiesCorrect);
      correctQuality += Number(qualityCorrect);
      item.expectedRecords.forEach((record, index) => {
        Object.entries(record).forEach(([key, value]) => {
          correctFields += Number(actualRecords[index]?.[key] === value);
        });
      });
      const wouldAlert = alertFor(item, result.plan, actualRecords);
      if (wouldAlert && item.expectChange === false) falseAlerts++;
      if (!wouldAlert && item.expectChange === true) missedAlerts++;
      passed =
        entitiesCorrect &&
        qualityCorrect &&
        (item.expectedSemanticStatus === undefined ||
          semanticStatus === item.expectedSemanticStatus) &&
        (item.expectChange === undefined || wouldAlert === item.expectChange);
      for (const trace of result.trace) {
        const metric = (stageTotals[trace.stage] ??= { calls: 0, failures: 0, durationMs: 0 });
        metric.calls++;
        metric.failures += Number(trace.status === 'FAILED');
        metric.durationMs += trace.durationMs;
      }
    } catch (error) {
      errorName = error instanceof Error ? error.name : 'UnknownError';
      if (item.expectChange === true) missedAlerts++;
      for (const trace of error && typeof error === 'object' && 'trace' in error
        ? (error.trace as Array<{ stage: string; durationMs: number; status: string }>)
        : []) {
        const metric = (stageTotals[trace.stage] ??= { calls: 0, failures: 0, durationMs: 0 });
        metric.calls++;
        metric.failures += Number(trace.status === 'FAILED');
        metric.durationMs += trace.durationMs;
      }
    }
    for (const [task, metric] of Object.entries(countedProvider.callsByTask)) {
      const total = (taskTotals[task] ??= { calls: 0, failures: 0, durationMs: 0 });
      total.calls += metric.calls;
      total.failures += metric.failures;
      total.durationMs += metric.durationMs;
    }
    results.push({
      name: item.name,
      passed,
      quality,
      ...(semanticStatus ? { semanticStatus } : {}),
      ...(errorName ? { error: errorName } : {}),
    });
  }

  const modelCalls = Object.values(taskTotals).reduce((total, metric) => total + metric.calls, 0);
  const modelDurationMs = Object.values(taskTotals).reduce(
    (total, metric) => total + metric.durationMs,
    0
  );
  return {
    cases: cases.length,
    fieldAccuracy: totalFields ? correctFields / totalFields : 1,
    entityAccuracy: cases.length ? exactEntities / cases.length : 1,
    qualityAccuracy: cases.length ? correctQuality / cases.length : 1,
    falseAlerts,
    missedAlerts,
    modelCalls,
    modelDurationMs,
    modelCallsByTask: taskTotals,
    stages: stageTotals,
    durationMs: Date.now() - started,
    results,
  };
}

export function createFixtureModelProvider(
  responses: ConfigurationEvaluationCase['responses']
): IModelProvider {
  return new FixtureModelProvider(responses);
}

export function validateConfigurationEvaluationCase(item: ConfigurationEvaluationCase): void {
  extractionIntentSchema.parse(item.responses.intent);
  const plans = Array.isArray(item.responses.plan) ? item.responses.plan : [item.responses.plan];
  plans.forEach((plan) => executionStrategySchema.parse(plan));
}
