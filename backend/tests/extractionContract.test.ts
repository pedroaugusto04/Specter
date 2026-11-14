import { zodToJsonSchema } from 'zod-to-json-schema';
import { describe, expect, it } from 'vitest';
import { extractionPlanSchema, extractionIntentSchema } from '../src/types/extractionPlan.js';
import { fixturePlan } from './helpers/extractionFixtures.js';
import { modelConfigurationDecisionSchema } from '../src/extraction/configurationSchemas.js';
import { ConfigurationDecisionKind } from '../src/extraction/configurationConstants.js';
import { semanticReviewStatus } from '../src/extraction/configurationReview.js';
import { SemanticReviewStatus } from '../src/extraction/constants.js';
import { observation } from '../src/extraction/configurationTools.js';

describe('Single extraction contract', () => {
  it('publishes numeric locale and boolean mapping requirements in the model JSON schema', () => {
    const schema = zodToJsonSchema(extractionIntentSchema, { $refStrategy: 'none' }) as {
      additionalProperties: boolean;
      properties: {
        fields: {
          additionalProperties: {
            anyOf: Array<{
              properties: Record<string, unknown> & { type: { const: string } };
              required: string[];
            }>;
          };
        };
      };
    };
    const variants = schema.properties.fields.additionalProperties.anyOf;
    const number = variants.find((variant) => variant.properties.type.const === 'number');
    const boolean = variants.find((variant) => variant.properties.type.const === 'boolean');
    expect(number?.required).toContain('locale');
    expect(boolean?.required).toContain('booleanValues');
    expect(schema.additionalProperties).toBe(false);
    for (const variant of variants) {
      const type = variant.properties.type.const;
      expect('booleanValues' in variant.properties).toBe(type === 'boolean');
      expect('normalizeVolatileText' in variant.properties).toBe(type === 'string');
      expect('locale' in variant.properties).toBe(type === 'number' || type === 'date');
    }
  });

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
    const {
      identityFields: _id,
      triggerRules: _rules,
      triggerMatchMode: _mode,
      ...intentWithoutOptionalLists
    } = plan.intent;
    const { empty: _empty, ...strategyWithoutEmpty } = plan.strategy;
    expect(
      extractionPlanSchema.parse({
        intent: intentWithoutOptionalLists,
        strategy: strategyWithoutEmpty,
      })
    ).toEqual(plan);
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
