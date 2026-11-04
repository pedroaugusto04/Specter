export {
  ExtractionScope as EXTRACTION_SCOPE,
  TriggerMatchMode as TRIGGER_MATCH_MODE,
  TriggerOperator as TRIGGER_OPERATOR,
} from '@specter/contracts';
export type { ExtractionScope, TriggerMatchMode } from '@specter/contracts';

// Shared domain contracts contain no runtime/backend dependencies.
export type {
  IntentField as ExtractionField,
  ExtractionPlan,
  ExtractionReport,
  FieldEvidence,
  SemanticPolicy,
  SemanticReview,
  TriggerOperator,
  TriggerRule,
} from '@specter/contracts';
