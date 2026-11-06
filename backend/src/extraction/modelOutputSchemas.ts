import { z } from 'zod';
import {
  conditionSchema,
  discoveryActionSchema,
  executionStrategySchema,
  extractionIntentSchema,
  locatorSchema,
  sourceSchema,
} from '../types/extractionPlan.js';

// These flatter schemas guide model output. The domain schemas still validate every
// variant and its required fields before any action or strategy is used.
const text = z.string().trim().min(1);
const path = z.array(z.union([z.string(), z.number().int().nonnegative()]));
const match = z.object({ urlPattern: text, method: text.optional() }).strict();
const kinds = (options: readonly { shape: { kind: z.ZodLiteral<string> } }[]) =>
  options.map((option) => option.shape.kind.value) as [string, ...string[]];
const locator = z
  .object({
    kind: z.enum(kinds(locatorSchema.options)),
    selector: text.optional(),
    role: text.optional(),
    name: text.optional(),
    exact: z.boolean().optional(),
  })
  .strict();
const condition = z
  .object({
    kind: z.enum(kinds(conditionSchema.options)),
    locator: locator.optional(),
    attribute: text.optional(),
    value: z.string().optional(),
    field: text.optional(),
    match: match.optional(),
    path: path.optional(),
    equals: z.union([z.string(), z.number().finite(), z.boolean()]).optional(),
  })
  .strict();
const actionCondition = condition.omit({ field: true }).extend({
  kind: z.enum(
    kinds(conditionSchema.options.filter((option) => option.shape.kind.value !== 'field'))
  ),
});
const action = z
  .object({
    kind: z.enum(kinds(discoveryActionSchema.options)),
    selector: text.optional(),
    locator: locator.optional(),
    condition: actionCondition.optional(),
  })
  .strict();

export const modelDiscoverySchema = z.object({ action: action.nullable() }).strict();
export const modelIntentSchema = extractionIntentSchema.partial({
  filters: true,
  triggerRules: true,
});

const records = z
  .object({
    kind: z.enum(kinds(executionStrategySchema.shape.records.options)),
    selector: text.optional(),
    type: text.optional(),
    match: match.optional(),
    path: path.optional(),
  })
  .strict();
const source = z
  .object({
    kind: z.enum(kinds(sourceSchema.options)),
    selector: text.optional(),
    attribute: text.optional(),
    path: path.optional(),
    association: text.optional(),
  })
  .strict();
export const modelStrategySchema = executionStrategySchema.extend({
  setup: z.array(action).optional(),
  records,
  fields: z.record(text, z.array(source).min(1)),
  ready: z.array(condition).min(1),
  empty: z.array(condition).optional(),
  pagination: z
    .object({
      kind: z.enum(['link', 'click', 'scroll']),
      next: locator.optional(),
      scrollTarget: text.optional(),
      end: z.array(condition).min(1),
    })
    .strict()
    .optional(),
});
