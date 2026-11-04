import { z } from 'zod';
import {
  ExtractionMode,
  ExtractionQuality,
  ExtractionScope,
  ExtractionSourceKind,
  DOM_TEXT_ATTRIBUTE,
  FieldValueType,
  PaginationKind,
  TriggerOperator,
  TriggerMatchMode,
} from './enums.js';

export { ExtractionQuality, TriggerOperator } from './enums.js';

const selector = z.string().trim().min(1);
const source = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal(ExtractionSourceKind.Dom),
      selector,
      attribute: z.string().default(DOM_TEXT_ATTRIBUTE),
    })
    .strict(),
  z
    .object({
      kind: z.literal(ExtractionSourceKind.JsonLd),
      path: z.array(z.union([z.string(), z.number().int().nonnegative()])).min(1),
    })
    .strict(),
]);
const field = z
  .object({
    sources: z.array(source).min(1),
    type: z.nativeEnum(FieldValueType),
    required: z.boolean().default(true),
    normalizeVolatileText: z.boolean().default(false),
    locale: z.string().optional(),
    booleanValues: z.record(z.boolean()).optional(),
  })
  .strict();
const rule = z
  .object({
    field: selector,
    operator: z.nativeEnum(TriggerOperator),
    value: z.union([z.string(), z.number().finite(), z.boolean()]),
  })
  .strict();
export type TriggerRule = z.infer<typeof rule>;
export const extractionPlanSchema = z
  .object({
    version: z.literal(2),
    mode: z.nativeEnum(ExtractionMode),
    containerSelector: selector.optional(),
    jsonLdType: selector.optional(),
    fields: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), field),
    identityFields: z.array(selector).default([]),
    readySelector: selector,
    emptySelector: selector.optional(),
    scope: z.nativeEnum(ExtractionScope).default(ExtractionScope.Page),
    pagination: z
      .object({
        kind: z.nativeEnum(PaginationKind),
        nextSelector: selector.optional(),
        endSelector: selector,
      })
      .strict()
      .optional(),
    triggerRules: z.array(rule).default([]),
    triggerMatchMode: z.nativeEnum(TriggerMatchMode).default(TriggerMatchMode.All),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (!Object.keys(plan.fields).length) issue('At least one field is required.');
    if (
      plan.mode === ExtractionMode.Collection &&
      (!plan.identityFields.length || (!plan.containerSelector && !plan.jsonLdType))
    )
      issue('Collections require an entity source and stable identity fields.');
    if (
      plan.mode === ExtractionMode.Collection &&
      !plan.containerSelector &&
      !plan.jsonLdType &&
      Object.values(plan.fields).some((definition) =>
        definition.sources.some((item) => item.kind === ExtractionSourceKind.JsonLd)
      )
    ) {
      issue('JSON-LD collections require an explicit entity type.');
    }
    if (
      plan.mode === ExtractionMode.Collection &&
      plan.containerSelector &&
      Object.values(plan.fields).some((definition) =>
        definition.sources.some((item) => item.kind === ExtractionSourceKind.JsonLd)
      )
    ) {
      issue(
        'JSON-LD fields cannot be combined with DOM containers until entities can be associated safely.'
      );
    }
    if (
      plan.mode === ExtractionMode.Collection &&
      !plan.containerSelector &&
      Object.values(plan.fields).some((definition) =>
        definition.sources.some((item) => item.kind === ExtractionSourceKind.Dom)
      )
    ) {
      issue(
        'DOM fields cannot be combined with JSON-LD collection entities until entities can be associated safely.'
      );
    }
    for (const name of [...plan.identityFields, ...plan.triggerRules.map((r) => r.field)]) {
      if (!plan.fields[name]?.required)
        issue(`Referenced field '${name}' must exist and be required.`);
    }
    for (const [name, definition] of Object.entries(plan.fields)) {
      if (definition.type === FieldValueType.Number && !definition.locale)
        issue(`Numeric field '${name}' requires an explicit locale.`);
      if (definition.locale) {
        try {
          new Intl.NumberFormat(definition.locale);
        } catch {
          issue(`Invalid locale for '${name}'.`);
        }
      }
      if (
        definition.type === FieldValueType.Boolean &&
        !Object.keys(definition.booleanValues ?? {}).length
      )
        issue(`Boolean field '${name}' requires an explicit value mapping.`);
    }
    if (
      plan.scope === ExtractionScope.Collection &&
      (!plan.pagination || plan.mode !== ExtractionMode.Collection)
    )
      issue('Full collection scope requires pagination and collection mode.');
    if (plan.pagination && plan.scope !== ExtractionScope.Collection)
      issue('Pagination requires collection scope.');
    if (
      plan.pagination &&
      plan.pagination.kind !== PaginationKind.Scroll &&
      !plan.pagination.nextSelector
    )
      issue('Link and click pagination require a next selector.');
  });

export function parseCompilerOutput(value: unknown): ExtractionPlan {
  if (value && typeof value === 'object' && 'error' in value) {
    const explanation = (value as { error?: unknown }).error;
    if (typeof explanation === 'string' && explanation.trim()) {
      throw new Error(explanation.trim());
    }
  }
  return extractionPlanSchema.parse(value);
}

export type ExtractionPlan = z.infer<typeof extractionPlanSchema>;
export type ExtractionField = ExtractionPlan['fields'][string];
export interface ExtractionReport {
  quality: ExtractionQuality;
  scope: ExtractionScope;
  pagesVisited: number;
  issues: string[];
  /** Counts successful extractions keyed as `${fieldName}#${sourceIndex}`. */
  sourcesUsed: Record<string, number>;
}
