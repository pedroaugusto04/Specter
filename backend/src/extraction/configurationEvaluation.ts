import { sameIntent } from './configurationPolicy.js';
import { ConfigurationDecisionKind } from './configurationConstants.js';
import { evaluationWouldAlert } from './evaluationAlerts.js';
import { payloadRecords } from './comparison.js';
import { canonicalJson } from '../utils/diffHasher.js';
import { ConfigurationPipeline } from './configuration.js';
import { ConfigurationFailure } from './configurationFailure.js';
import { evaluateCondition } from './conditions.js';
import { ExtractionExecutor } from './executor.js';
import { PageExtractor } from './pageExtractor.js';
import { standardSourceReaders } from './sources.js';
import { createConfigurationModel } from './configurationModel.js';
import {
  extractionIntentSchema,
  extractionPlanSchema,
  normalizeSingleFieldSources,
} from '../types/extractionPlan.js';
import type {
  DocumentAdapter,
  DocumentSnapshot,
  ExtractionPlan,
  ExtractionIntent,
  DiscoveryAction,
  Scalar,
} from './contracts.js';
import type { ConfigurationRequest } from './configuration.js';
import type { IModelProvider, ModelInput } from './model.js';
import type { ExecutionPolicy } from './contracts.js';
import { ExtractionMode, isAcceptedExtractionQuality } from './constants.js';

interface ConfigurationEvaluationCaseBase {
  name: string;
  prompt: string;
  snapshot: DocumentSnapshot;
  responses: { configure: unknown[]; semantic: unknown };
  expectedRecords: Record<string, Scalar>[];
  category?: string;
  isolated?: boolean;
  expectedIntent?: ExtractionIntent;
  maxModelCalls?: Partial<Record<ModelInput['task'], number>>;
  interactions?: Array<{ action: DiscoveryAction; snapshot: DocumentSnapshot }>;
  routine?: Array<{
    name: string;
    snapshot: DocumentSnapshot;
    interactions?: Array<{ action: DiscoveryAction; snapshot: DocumentSnapshot }>;
    expectedRecords: Record<string, Scalar>[];
    expectedQuality: import('../types/extractionPlan.js').ExtractionReport['quality'];
    expectChange: boolean;
  }>;
  expectedSemanticStatus?: string;
  previousRecords?: Record<string, Scalar>[];
  expectChange?: boolean;
}

export type ConfigurationEvaluationCase = ConfigurationEvaluationCaseBase &
  (
    | {
        expectedQuality: 'FAILED';
        expectedErrorCode: string;
        expectedErrorIncludes: string;
      }
    | {
        expectedQuality: 'COMPLETE' | 'EMPTY';
        expectedErrorCode?: never;
        expectedErrorIncludes?: never;
      }
  );

export interface ConfigurationEvaluationReport {
  cases: number;
  fieldAccuracy: number;
  entityAccuracy: number;
  qualityAccuracy: number;
  falseAlerts: number;
  missedAlerts: number;
  falseAcceptances: number;
  checks: Record<string, { passed: number; total: number }>;
  modelCalls: number;
  modelDurationMs: number;
  modelCallsByTask: Record<string, { calls: number; failures: number; durationMs: number }>;
  stages: Record<string, { calls: number; failures: number; durationMs: number }>;
  durationMs: number;
  results: Array<{
    name: string;
    passed: boolean;
    quality: string;
    category: string;
    checks: Record<string, boolean>;
    modelCallsByTask: ConfigurationEvaluationReport['modelCallsByTask'];
    durationMs: number;
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

export class CountingModelProvider implements IModelProvider {
  readonly name: string;
  readonly callsByTask: ConfigurationEvaluationReport['modelCallsByTask'] = {};

  constructor(private readonly provider: IModelProvider) {
    this.name = provider.name;
  }

  get totalCalls(): number {
    return Object.values(this.callsByTask).reduce((total, metric) => total + metric.calls, 0);
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

/** Every execution opens the initial document; only a matching action reveals new state. */
function fixtureAdapter(
  snapshot: DocumentSnapshot,
  interactions: NonNullable<ConfigurationEvaluationCase['interactions']> = [],
  passive = false
): DocumentAdapter {
  return {
    async open() {
      let captured = structuredClone(snapshot);
      let offset = 0;
      return {
        capabilities: {
          interactions: !passive,
          networkResponses: !passive,
          scopedDocuments: !passive,
        },
        snapshot: async () => structuredClone(captured),
        check: async (condition) => evaluateCondition(condition, captured, []),
        advance: async () => {
          throw new Error('Pagination needs a browser integration fixture.');
        },
        discover: async (action) => {
          const transition = interactions[offset];
          if (!transition || canonicalJson(transition.action) !== canonicalJson(action))
            throw new Error('No fixture transition matches the requested action.');
          offset++;
          captured = structuredClone(transition.snapshot);
          return structuredClone(captured);
        },
        screenshot: async () => undefined,
        close: async () => {},
      };
    },
  };
}

function recordsEqual(
  actual: Record<string, Scalar>[],
  expected: Record<string, Scalar>[],
  collection: boolean
) {
  const canonical = (records: Record<string, Scalar>[]) =>
    collection ? records.map(canonicalJson).sort() : records;
  return canonicalJson(canonical(actual)) === canonicalJson(canonical(expected));
}

export function fixtureExecutor(
  snapshot: DocumentSnapshot,
  interactions: ConfigurationEvaluationCase['interactions']
) {
  return new ExtractionExecutor(
    {
      http: fixtureAdapter(snapshot, [], true),
      browser: fixtureAdapter(snapshot, interactions),
    },
    new PageExtractor(standardSourceReaders()),
    policy
  );
}

function addStageMetrics(
  totals: ConfigurationEvaluationReport['stages'],
  traces: Array<{ stage: string; status: string; durationMs: number }>
): void {
  for (const trace of traces) {
    const metric = (totals[trace.stage] ??= { calls: 0, failures: 0, durationMs: 0 });
    metric.calls++;
    metric.failures += Number(trace.status === 'FAILED');
    metric.durationMs += trace.durationMs;
  }
}

function alertFor(
  item: ConfigurationEvaluationCase,
  plan: ExtractionPlan,
  currentRecords: Record<string, Scalar>[]
): boolean {
  return evaluationWouldAlert({
    name: item.name,
    url: item.snapshot.url,
    prompt: item.prompt,
    plan,
    currentRecords,
    previousRecords: item.previousRecords,
  });
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
  let falseAcceptances = 0;
  const checkTotals: ConfigurationEvaluationReport['checks'] = {};

  const results = [];
  if (!cases.length) throw new Error('An evaluation corpus must contain cases.');
  if (new Set(cases.map((item) => item.name)).size !== cases.length)
    throw new Error('Evaluation case names must be unique.');
  for (const item of cases) {
    const caseStarted = Date.now();
    const checks: Record<string, boolean> = {};
    const check = (name: string, passed: boolean) => {
      checks[name] = passed;
    };

    totalFields += item.expectedRecords.reduce(
      (total, record) => total + Object.keys(record).length,
      0
    );
    const caseProvider = typeof provider === 'function' ? provider(item) : provider;
    const countedProvider = new CountingModelProvider(caseProvider);
    let quality = 'FAILED';
    let semanticStatus: string | undefined;
    let errorName: string | undefined;
    try {
      const stages = createConfigurationModel(countedProvider);
      const decide = stages.decide.bind(stages);
      stages.decide = async (input, intent) => {
        const decision = await decide(input, intent);
        if (decision.kind === ConfigurationDecisionKind.Candidate && item.expectedIntent) {
          const candidate = extractionPlanSchema.safeParse(
            normalizeSingleFieldSources(decision.plan, item.snapshot)
          );
          if (candidate.success)
            check('intent', sameIntent(candidate.data.intent, item.expectedIntent));
        }
        return decision;
      };
      const pipeline = new ConfigurationPipeline(
        stages,
        fixtureAdapter(item.snapshot, item.interactions),
        fixtureExecutor(item.snapshot, item.interactions),
        {
          budgetMs: 30000,
          maxAttempts: 2,
          maxDecisions: 6,
          reviewReserveMs: 1000,
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
      const actualRecords = payloadRecords(result.execution.data);
      const entitiesCorrect = recordsEqual(
        actualRecords,
        item.expectedRecords,
        result.plan.intent.mode === ExtractionMode.Collection
      );
      check('acceptance', item.expectedQuality !== 'FAILED');
      if (item.expectedQuality === 'FAILED') falseAcceptances++;
      check('extraction', entitiesCorrect);
      check('quality', quality === item.expectedQuality);
      const qualityCorrect = quality === item.expectedQuality;
      exactEntities += Number(entitiesCorrect && item.expectedQuality !== 'FAILED');
      correctQuality += Number(qualityCorrect);
      item.expectedRecords.forEach((record, index) => {
        Object.entries(record).forEach(([key, value]) => {
          correctFields += Number(actualRecords[index]?.[key] === value);
        });
      });
      const wouldAlert = alertFor(item, result.plan, actualRecords);
      if (wouldAlert && item.expectChange === false) falseAlerts++;
      if (!wouldAlert && item.expectChange === true) missedAlerts++;
      if (item.expectedSemanticStatus !== undefined)
        check('semantic', semanticStatus === item.expectedSemanticStatus);
      if (item.expectChange !== undefined) check('alerts', wouldAlert === item.expectChange);
      let baseline = actualRecords;
      const callsBeforeRoutine = JSON.stringify(countedProvider.callsByTask);
      for (const step of item.routine ?? []) {
        const execution = await fixtureExecutor(step.snapshot, step.interactions).execute(
          step.snapshot.url,
          result.plan
        );
        const records = payloadRecords(execution.data);
        const accepted = isAcceptedExtractionQuality(execution.report.quality);
        const alerts =
          accepted && alertFor({ ...item, previousRecords: baseline }, result.plan, records);
        check(
          'routine:' + step.name,
          execution.report.quality === step.expectedQuality &&
            recordsEqual(
              records,
              step.expectedRecords,
              result.plan.intent.mode === ExtractionMode.Collection
            ) &&
            alerts === step.expectChange
        );
        if (alerts && !step.expectChange) falseAlerts++;
        if (!alerts && step.expectChange) missedAlerts++;
        // Rejected snapshots must never replace the baseline in the scenario.
        if (accepted) baseline = records;
      }
      if (item.routine?.length)
        check(
          'routineWithoutModels',
          JSON.stringify(countedProvider.callsByTask) === callsBeforeRoutine
        );
      addStageMetrics(stageTotals, result.trace);
    } catch (error) {
      errorName = error instanceof Error ? error.name : 'UnknownError';
      if (error instanceof ConfigurationFailure) semanticStatus = error.semanticReview?.status;
      const expectedFailure =
        item.expectedQuality === 'FAILED' &&
        error instanceof ConfigurationFailure &&
        error.code === item.expectedErrorCode &&
        error.message.includes(item.expectedErrorIncludes);
      check('acceptance', expectedFailure);
      check('quality', expectedFailure);
      correctQuality += Number(expectedFailure);
      if (item.expectedIntent && checks.intent === undefined) check('intent', false);
      if (item.expectChange === true) missedAlerts++;
      if (error instanceof ConfigurationFailure && item.expectedSemanticStatus)
        check('semantic', error.semanticReview?.status === item.expectedSemanticStatus);
      if (error instanceof ConfigurationFailure) addStageMetrics(stageTotals, error.trace);
    }
    for (const [task, metric] of Object.entries(countedProvider.callsByTask)) {
      const total = (taskTotals[task] ??= { calls: 0, failures: 0, durationMs: 0 });
      total.calls += metric.calls;
      total.failures += metric.failures;
      total.durationMs += metric.durationMs;
    }
    for (const [task, limit] of Object.entries(item.maxModelCalls ?? {}))
      check('budget:' + task, (countedProvider.callsByTask[task]?.calls ?? 0) <= limit!);
    for (const [name, succeeded] of Object.entries(checks)) {
      const total = (checkTotals[name] ??= { passed: 0, total: 0 });
      total.total++;
      total.passed += Number(succeeded);
    }
    const passed = Object.values(checks).every(Boolean);
    results.push({
      category: item.category ?? 'uncategorized',
      checks,
      modelCallsByTask: countedProvider.callsByTask,
      durationMs: Date.now() - caseStarted,
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
    entityAccuracy: cases.some((item) => item.expectedQuality !== 'FAILED')
      ? exactEntities / cases.filter((item) => item.expectedQuality !== 'FAILED').length
      : 1,
    qualityAccuracy: cases.length ? correctQuality / cases.length : 1,
    falseAlerts,
    missedAlerts,
    falseAcceptances,
    checks: checkTotals,
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
  if (!item.name.trim() || !item.prompt.trim())
    throw new Error('Case name and prompt are required.');
  if (item.expectedQuality === 'FAILED' && (!item.expectedErrorCode || !item.expectedErrorIncludes))
    throw new Error('Rejected cases require an expected error code and reason.');
  if (item.expectedIntent) extractionIntentSchema.parse(item.expectedIntent);
  for (const limit of Object.values(item.maxModelCalls ?? {}))
    if (!Number.isInteger(limit) || limit! < 0) throw new Error('Invalid model call budget.');
  // Recorded outputs may intentionally violate a model contract to exercise recovery.
  // Validate the independent oracle, not the candidate responses.
}
