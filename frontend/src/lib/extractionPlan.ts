export {
  ExtractionScope as EXTRACTION_SCOPE,
  TriggerMatchMode as TRIGGER_MATCH_MODE,
  TriggerOperator as TRIGGER_OPERATOR,
} from '../../../backend/src/extraction/constants';
export type { ExtractionScope, TriggerMatchMode } from '../../../backend/src/extraction/constants';

// Shared domain contracts contain no runtime/backend dependencies.
export type {
  ExtractionPlan,
  TriggerRule,
  TriggerOperator,
  IntentField as ExtractionField,
  SemanticPolicy,
  SemanticReview,
  FieldEvidence,
  ExtractionReport,
} from '../../../backend/src/extraction/contracts';
