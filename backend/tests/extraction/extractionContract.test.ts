import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { extractionPlanSchema, extractionIntentSchema } from '../../src/types/extractionPlan.js';
import { fixturePlan } from '../helpers/extractionFixtures.js';
import { modelConfigurationDecisionSchema } from '../../src/extraction/configurationSchemas.js';
import { ConfigurationDecisionKind } from '../../src/extraction/configurationConstants.js';
import { semanticReviewStatus } from '../../src/extraction/configurationReview.js';
import { SemanticReviewStatus } from '../../src/extraction/constants.js';
import { observation } from '../../src/extraction/configurationTools.js';

describe('Single extraction contract', () => {
  it('publishes numeric locale and boolean mapping requirements in the model JSON schema', () => {
    type JsonSchemaVariant = {
      properties?: {
        type?: { const?: string };
        booleanValues?: unknown;
        normalizeVolatileText?: unknown;
        locale?: unknown;
      };
      required?: string[];
    };
    type JsonSchemaTree = {
      additionalProperties?: boolean;
      properties?: {
        fields?: {
          additionalProperties?: {
            anyOf?: JsonSchemaVariant[];
            oneOf?: JsonSchemaVariant[];
          };
        };
      };
    };
    const schema = z.toJSONSchema(extractionIntentSchema, {
      target: 'draft-07',
      io: 'input',
    }) as JsonSchemaTree;
    expect(schema.additionalProperties).toBe(false);

    const alternatives = schema.properties?.fields?.additionalProperties;
    const variants = alternatives?.oneOf ?? alternatives?.anyOf ?? [];
    const numberVariant = variants.find((v) => v.properties?.type?.const === 'number');
    const booleanVariant = variants.find((v) => v.properties?.type?.const === 'boolean');

    expect(numberVariant?.required).toContain('locale');
    expect(booleanVariant?.required).toContain('booleanValues');

    for (const v of variants) {
      const type = v.properties?.type?.const;
      expect(Boolean(v.properties?.booleanValues)).toBe(type === 'boolean');
      expect(Boolean(v.properties?.normalizeVolatileText)).toBe(type === 'string');
      expect(Boolean(v.properties?.locale)).toBe(type === 'number' || type === 'date');
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
