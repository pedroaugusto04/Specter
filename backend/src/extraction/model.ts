import type { ExtractionIntent, ExecutionStrategy, DiscoveryAction } from './contracts.js';

export interface ModelInput {
  jobId: string;
  task: 'intent' | 'discovery' | 'plan' | 'semantic';
  instructions: string;
  outputSchema?: Record<string, unknown>;
  evidence: string;
  timeoutMs: number;
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
}

export interface IIntentInterpreter {
  interpret(input: StageInput): Promise<ExtractionIntent>;
}

export interface IPlanGenerator {
  generate(
    input: StageInput,
    intent: ExtractionIntent,
    feedback: string
  ): Promise<ExecutionStrategy>;
}

export interface SemanticVerdict {
  score: number;
  reasons: string[];
  evidenceRefs: string[];
}

export interface ISemanticReviewer {
  review(input: StageInput, intent: ExtractionIntent, result: unknown): Promise<SemanticVerdict>;
}

export interface IDiscoveryPlanner {
  next(input: StageInput, intent: ExtractionIntent): Promise<DiscoveryAction | null>;
}

export interface ConfigurationStages {
  interpreter: IIntentInterpreter;
  discovery: IDiscoveryPlanner;
  generator: IPlanGenerator;
  reviewer: ISemanticReviewer;
}
