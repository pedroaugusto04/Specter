/** Backend protocol identifiers shared by schemas, orchestration and evaluation. */
export const ModelTask = {
  Configure: 'configure',
  Semantic: 'semantic',
  Diagnostic: 'diagnostic',
} as const;
export type ModelTask = (typeof ModelTask)[keyof typeof ModelTask];
export const ConfigurationDecisionKind = { Tool: 'tool', Candidate: 'candidate' } as const;
export const ConfigurationToolKind = {
  Inspect: 'inspect',
  Query: 'query',
  Structured: 'structured',
  Responses: 'responses',
  Interact: 'interact',
} as const;
export const ConfigurationStage = {
  Acquisition: 'acquisition',
  Configure: ModelTask.Configure,
  Validation: 'validation',
  Semantic: ModelTask.Semantic,
} as const;
export const ConfigurationErrorCode = {
  Rejected: 'CONFIGURATION_REJECTED',
  OperationFailed: 'CONFIGURATION_OPERATION_FAILED',
} as const;
export const SemanticReviewWarningScore = 7;
export const MaxConsecutiveOperationRepeats = 2;
