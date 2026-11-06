import { describe, expect, it } from 'vitest';
import { extractionPlanSchema } from '../src/types/extractionPlan.js';
import { fixturePlan } from './helpers/extractionFixtures.js';
import { modelConfigurationDecisionSchema } from '../src/extraction/configurationSchemas.js';
import { ConfigurationDecisionKind } from '../src/extraction/configurationConstants.js';
import { semanticReviewStatus } from '../src/extraction/configurationReview.js';
import { SemanticReviewStatus } from '../src/extraction/constants.js';
import { observation } from '../src/extraction/configurationTools.js';

describe('Single extraction contract', () => {
  it('uses one strict plan shape in the domain and model output', () => {
    const plan = fixturePlan();
    expect(Object.keys(plan).sort()).toEqual(['intent', 'strategy']);
    expect(extractionPlanSchema.parse(plan)).toEqual(plan);
    expect(
      modelConfigurationDecisionSchema.parse({ kind: ConfigurationDecisionKind.Candidate, plan })
    ).toEqual({ kind: ConfigurationDecisionKind.Candidate, plan });
    expect(extractionPlanSchema.safeParse({ ...plan, version: 3 }).success).toBe(false);
    expect(
      modelConfigurationDecisionSchema.safeParse({
        kind: ConfigurationDecisionKind.Candidate,
        plan: { ...plan, strategy: { ...plan.strategy, fields: {} } },
      }).success
    ).toBe(false);
  });

  for (const [score, status] of [
    [3, SemanticReviewStatus.Rejected],
    [4, SemanticReviewStatus.Warning],
    [6, SemanticReviewStatus.Warning],
    [7, SemanticReviewStatus.Passed],
  ] as const)
    it(`classifies semantic score ${score}`, () => {
      expect(semanticReviewStatus(score, 4)).toBe(status);
    });

  it('keeps observations valid JSON and explicitly reports truncation', () => {
    const encoded = observation(
      {
        html: '<main>' + '"'.repeat(10000) + '</main>',
        httpStatus: 200,
        responses: [],
        url: 'https://example.com',
      },
      500
    );
    expect(encoded.length).toBeLessThanOrEqual(500);
    expect(JSON.parse(encoded)).toMatchObject({ truncated: true, httpStatus: 200 });
  });
});
