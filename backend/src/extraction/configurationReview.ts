import { DomainError } from '../errors/domainErrors.js';
import type { ConfigurationModel, StageInput } from './model.js';
import type { ExtractionIntent, SemanticReview, StageTrace } from './contracts.js';
import type { ExecutionResult } from './executor.js';
import type { RunConfigurationOperation } from './configurationSession.js';
import { ConfigurationFailure } from './configurationFailure.js';
import { ConfigurationStage, SemanticReviewWarningScore } from './configurationConstants.js';
import { SemanticReviewStatus } from './constants.js';
import { observation } from './configurationTools.js';

export function semanticReviewStatus(score: number, threshold: number): SemanticReview['status'] {
  return score < threshold
    ? SemanticReviewStatus.Rejected
    : score < SemanticReviewWarningScore
      ? SemanticReviewStatus.Warning
      : SemanticReviewStatus.Passed;
}
export async function reviewConfiguration(input: {
  model: ConfigurationModel;
  enabled: boolean;
  threshold: number;
  intent: ExtractionIntent;
  execution: ExecutionResult;
  stageInput: StageInput;
  evidenceLimit: number;
  trace: StageTrace[];
  run: RunConfigurationOperation;
}): Promise<SemanticReview> {
  if (!input.enabled)
    return {
      status: SemanticReviewStatus.Skipped,
      score: null,
      reasons: ['Semantic review disabled.'],
      evidenceRefs: [],
    };
  let semanticReview: SemanticReview;
  try {
    const review = await input.run(ConfigurationStage.Semantic, () =>
      input.model.review(
        {
          ...input.stageInput,
          evidence: observation(input.execution.snapshot, input.evidenceLimit),
        },
        input.intent,
        {
          data: input.execution.data,
          provenance: input.execution.report.evidence,
          coverage: input.execution.report.coverage,
        }
      )
    );
    semanticReview = { ...review, status: semanticReviewStatus(review.score, input.threshold) };
  } catch (error) {
    if (error instanceof DomainError && error.isRetryable) throw error;
    throw new ConfigurationFailure(
      'Semantic reviewer unavailable or invalid response.',
      input.trace,
      {
        status: SemanticReviewStatus.Error,
        score: null,
        reasons: ['Semantic reviewer unavailable or invalid response.'],
        evidenceRefs: [],
      }
    );
  }
  if (semanticReview.status === SemanticReviewStatus.Rejected)
    throw new ConfigurationFailure(
      'Semantic review rejected candidate: ' + semanticReview.reasons.join(' '),
      input.trace,
      semanticReview
    );
  return semanticReview;
}
