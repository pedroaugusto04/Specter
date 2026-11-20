import type { ModelTask } from './configurationConstants.js';
import type { ConfigurationDecision, SemanticVerdict } from './configurationSchemas.js';
export type {
  ConfigurationDecision,
  ConfigurationTool,
  SemanticVerdict,
} from './configurationSchemas.js';
import type { ExtractionIntent, ExtractionPlan, ExtractionReport } from './contracts.js';

export interface RecoveryContext {
  failure: Pick<
    ExtractionReport,
    'failureCode' | 'failureReason' | 'quality' | 'issues' | 'evidence'
  >;
  previousStrategy?: ExtractionPlan['strategy'];
}

export interface ModelInput {
  jobId: string;
  task: ModelTask;
  instructions: string;
  outputSchema?: Record<string, unknown>;
  evidence: string;
  timeoutMs: number;
  signal?: AbortSignal;
}
export interface IModelProvider {
  readonly name: string;
  generate(input: ModelInput): Promise<unknown>;
}
export interface StageInput {
  jobId: string;
  url: string;
  prompt: string;
  evidence: string;
  feedback?: string;
  lastRejectedPlan?: unknown;
  recovery?: RecoveryContext;
  timeoutMs: number;
  signal?: AbortSignal;
}
export interface ConfigurationModel {
  decide(input: StageInput, intent?: ExtractionIntent): Promise<ConfigurationDecision>;
  review(input: StageInput, intent: ExtractionIntent, result: unknown): Promise<SemanticVerdict>;
}
