import type { ModelTask } from './configurationConstants.js';
import type { ConfigurationDecision, SemanticVerdict } from './configurationSchemas.js';
export type {
  ConfigurationDecision,
  ConfigurationTool,
  SemanticVerdict,
} from './configurationSchemas.js';
import type { ExtractionIntent } from './contracts.js';

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
  timeoutMs: number;
  signal?: AbortSignal;
}
export interface ConfigurationModel {
  decide(input: StageInput, intent?: ExtractionIntent): Promise<ConfigurationDecision>;
  review(input: StageInput, intent: ExtractionIntent, result: unknown): Promise<SemanticVerdict>;
}
