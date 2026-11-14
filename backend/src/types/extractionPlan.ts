import { triggerOperatorsForType } from '@specter/contracts';
import { requiresBrowser } from '../extraction/capabilities.js';
import type { ExecutionStrategy } from '../extraction/contracts.js';
import {
  ExtractionMode,
  ExtractionScope,
  FieldType,
  SourceKind,
  Transport,
  TriggerOperator,
  TriggerMatchMode,
} from '../extraction/constants.js';
import { z } from 'zod';
import { ExtractionQuality } from './enums.js';
export { ExtractionQuality };
export type {
  ExtractionPlan,
  ExtractionIntent,
  ExecutionStrategy,
  IntentField as ExtractionField,
  TriggerRule,
  ExtractionReport,
} from '../extraction/contracts.js';

const text = z.string().trim().min(1);
const path = z.array(z.union([z.string(), z.number().int().nonnegative()]));
export const locatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('css'), selector: text }).strict(),
  z
    .object({ kind: z.literal('role'), role: text, name: text, exact: z.boolean().optional() })
    .strict(),
]);
const match = z
  .object({
    urlPattern: text.describe('Literal URL substring, not a regex or glob.'),
    method: text.optional(),
  })
  .strict();
export const conditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exists'), locator: locatorSchema }).strict(),
  z.object({ kind: z.literal('visible'), locator: locatorSchema }).strict(),
  z.object({ kind: z.literal('absent'), locator: locatorSchema }).strict(),
  z.object({ kind: z.literal('disabled'), locator: locatorSchema }).strict(),
  z
    .object({
      kind: z.literal('attribute'),
      locator: locatorSchema,
      attribute: text,
      value: z.string().optional(),
    })
    .strict(),
  z.object({ kind: z.literal('field'), field: text }).strict(),
  z
    .object({
      kind: z.literal(SourceKind.Response),
      match,
      path: path.optional(),
      equals: z.union([z.string(), z.number().finite(), z.boolean()]).optional(),
    })
    .strict(),
]);
export const discoveryActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inspect'), selector: text }).strict(),
  z.object({ kind: z.literal('click'), locator: locatorSchema }).strict(),
  z.object({ kind: z.literal('scroll'), selector: text.optional() }).strict(),
  z.object({ kind: z.literal('wait'), condition: conditionSchema }).strict(),
]);
export const sourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal(SourceKind.Dom),
      selector: text.describe(
        'CSS selector relative to the record; :scope reads the record itself.'
      ),
      attribute: text
        .describe('text reads textContent; otherwise use the HTML attribute name.')
        .refine((attribute) => !['textContent', 'innerText'].includes(attribute), {
          message: 'Use "text" to read DOM text.',
        }),
      pattern: text
        .describe('Unicode regex: first capture group, or whole match when no group exists.')
        .optional(),
      association: text.optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal(SourceKind.JsonLd), path: path.min(1), association: text.optional() })
    .strict(),
  z.object({ kind: z.literal(SourceKind.Response), path, association: text.optional() }).strict(),
]);
const fieldProperties = {
  displayName: text.optional(),
  observedLabel: text.optional(),
  description: text,
  required: z.boolean(),
};
export const extractionIntentSchema = z
  .object({
    entity: text,
    mode: z.nativeEnum(ExtractionMode),
    scope: z
      .nativeEnum(ExtractionScope)
      .default(ExtractionScope.Page)
      .describe(
        'Requested coverage: page means the current page; collection means the complete logical collection. Pagination is only one possible strategy to achieve collection coverage.'
      ),
    fields: z.record(
      z.string().regex(/^[a-z][a-z0-9_]*$/),
      z.discriminatedUnion('type', [
        z
          .object({
            ...fieldProperties,
            type: z.literal(FieldType.String),
            normalizeVolatileText: z
              .boolean()
              .describe(
                'Normalize volatile text before comparison; enable only when requested meaning is preserved.'
              )
              .optional(),
          })
          .strict(),
        z.object({ ...fieldProperties, type: z.literal(FieldType.Url) }).strict(),
        z
          .object({
            ...fieldProperties,
            type: z.literal(FieldType.Date),
            locale: text
              .describe(
                'Determines day/month order for ambiguous numeric dates; does not parse month names.'
              )
              .optional(),
          })
          .strict(),
        z
          .object({
            ...fieldProperties,
            type: z.literal(FieldType.Number),
            locale: text.describe('Observed numeric locale, e.g. en-US or pt-BR.'),
          })
          .strict(),
        z
          .object({
            ...fieldProperties,
            type: z.literal(FieldType.Boolean),
            booleanValues: z.record(
              z
                .string()
                .min(1)
                .regex(/^[^A-Z]*$/, 'Mapping keys must be lowercase.')
                .describe(
                  'Exact observed text, lowercase, trimmed, with internal whitespace collapsed.'
                ),
              z.boolean()
            ),
          })
          .strict(),
      ])
    ),
    identityFields: z.array(text).default([]),
    triggerRules: z
      .array(
        z
          .object({
            field: text,
            operator: z.nativeEnum(TriggerOperator),
            value: z.union([z.string(), z.number().finite(), z.boolean()]),
          })
          .strict()
      )
      .default([]),
    triggerMatchMode: z.nativeEnum(TriggerMatchMode).default(TriggerMatchMode.All),
  })
  .strict();
export const executionStrategySchema = z
  .object({
    transport: z.nativeEnum(Transport),
    setup: z.array(discoveryActionSchema).optional(),
    document: z.object({ frame: text.optional(), shadow: text.optional() }).strict().optional(),
    records: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal(SourceKind.Dom), selector: text }).strict(),
      z.object({ kind: z.literal(SourceKind.JsonLd), type: text }).strict(),
      z.object({ kind: z.literal(SourceKind.Response), match, path }).strict(),
    ]),
    filters: z
      .array(
        z
          .object({
            field: text,
            operator: z.enum([
              TriggerOperator.Equal,
              TriggerOperator.NotEqual,
              TriggerOperator.LessThan,
              TriggerOperator.LessThanOrEqual,
              TriggerOperator.GreaterThan,
              TriggerOperator.GreaterThanOrEqual,
              TriggerOperator.Contains,
              TriggerOperator.NotContains,
            ]),
            value: z.union([z.string(), z.number().finite(), z.boolean()]),
          })
          .strict()
      )
      .optional(),
    associations: z
      .record(
        text,
        z
          .object({
            localField: text,
            foreignPath: path.min(1),
            records: z.discriminatedUnion('kind', [
              z.object({ kind: z.literal(SourceKind.JsonLd), type: text }).strict(),
              z.object({ kind: z.literal(SourceKind.Response), match, path }).strict(),
            ]),
          })
          .strict()
      )
      .optional(),
    fields: z.record(text, z.array(sourceSchema).min(1)),
    ready: z.array(conditionSchema).min(1),
    empty: z.array(conditionSchema).default([]),
    pagination: z
      .object({
        kind: z.enum(['link', 'click', 'scroll']),
        next: locatorSchema.optional(),
        scrollTarget: text.optional(),
        end: z.array(conditionSchema).min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export const extractionPlanSchema = z
  .object({
    intent: extractionIntentSchema,
    strategy: executionStrategySchema,
  })
  .strict()
  .superRefine((plan, ctx) => {
    const issue = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: 'custom', message, path });
    const { intent, strategy: execution } = plan;

    if (execution.pagination && intent.scope !== ExtractionScope.Collection)
      issue('Pagination requires collection scope.', ['intent', 'scope']);
    if (
      intent.mode === ExtractionMode.Single &&
      (intent.scope !== ExtractionScope.Page ||
        execution.pagination ||
        intent.identityFields.length)
    )
      issue('Single entities require page scope, no pagination, and empty identityFields.', [
        'intent',
      ]);
    if (new Set(intent.identityFields).size !== intent.identityFields.length)
      issue('Identity fields must not repeat.', ['intent', 'identityFields']);

    if (!Object.keys(intent.fields).length)
      issue('At least one field is required.', ['intent', 'fields']);
    if (
      JSON.stringify(Object.keys(intent.fields).sort()) !==
      JSON.stringify(Object.keys(execution.fields).sort())
    )
      issue('Execution fields must exactly match intent fields.', ['strategy', 'fields']);

    for (const key of [...intent.identityFields, ...intent.triggerRules.map((rule) => rule.field)])
      if (!intent.fields[key]?.required)
        issue(`Referenced field '${key}' must exist and be required.`, ['intent', 'fields', key]);
    for (const rule of [...intent.triggerRules, ...(execution.filters ?? [])]) {
      const field = intent.fields[rule.field];
      if (!field) continue;
      if (!triggerOperatorsForType(field.type).includes(rule.operator))
        issue(`Operator '${rule.operator}' is incompatible with field '${rule.field}'.`);
      if (
        field.type === FieldType.Number &&
        rule.operator !== TriggerOperator.Changes &&
        rule.operator !== TriggerOperator.Decreased &&
        rule.operator !== TriggerOperator.Increased &&
        (typeof rule.value !== 'number' || !Number.isFinite(rule.value))
      )
        issue(`Numeric rule '${rule.field}' requires a finite numeric threshold.`);
      if (
        (rule.operator === TriggerOperator.Contains ||
          rule.operator === TriggerOperator.NotContains) &&
        typeof rule.value !== 'string'
      )
        issue(`Text rule '${rule.field}' requires a string threshold.`);
      if (rule.operator === TriggerOperator.Equal || rule.operator === TriggerOperator.NotEqual) {
        const expected =
          field.type === FieldType.Number
            ? 'number'
            : field.type === FieldType.Boolean
              ? 'boolean'
              : 'string';
        if (typeof rule.value !== expected)
          issue(`Rule '${rule.field}' has an incompatible threshold type.`);
      }
    }
    for (const [key, field] of Object.entries(intent.fields)) {
      if (
        field.type === FieldType.Boolean &&
        Object.keys(field.booleanValues).some(
          (value) => value !== value.toLowerCase().replace(/\s+/g, ' ').trim() || !value
        )
      )
        issue(`Boolean mapping keys for '${key}' must be lowercase with normalized whitespace.`);
      if ((field.type === FieldType.Number || field.type === FieldType.Date) && field.locale) {
        try {
          new Intl.NumberFormat(field.locale);
        } catch {
          issue(`Invalid locale for '${key}'.`, ['intent', 'fields', key, 'locale']);
        }
      }
      if (field.type === FieldType.Boolean && !Object.keys(field.booleanValues ?? {}).length)
        issue(`Boolean field '${key}' requires an explicit value mapping.`, [
          'intent',
          'fields',
          key,
          'booleanValues',
        ]);
    }
    if (intent.mode === ExtractionMode.Collection && !intent.identityFields.length)
      issue('Collections require stable identity fields.', ['intent', 'identityFields']);
    if (
      execution.pagination &&
      execution.pagination.kind !== 'scroll' &&
      !execution.pagination.next
    )
      issue('Link and click pagination require a next locator.', [
        'strategy',
        'pagination',
        'next',
      ]);
    for (const filter of execution.filters ?? [])
      if (!intent.fields[filter.field]?.required)
        issue('Record filters require a declared, required field.');
    const sources = Object.values(execution.fields).flat();
    if (sources.some((item) => item.kind !== execution.records.kind && !item.association))
      issue(
        'Field sources must belong to the selected record source or reference an explicit key association.'
      );
    for (const [name, association] of Object.entries(execution.associations ?? {})) {
      if (
        !intent.fields[association.localField]?.required ||
        execution.fields[association.localField]?.some((source) => source.association)
      )
        issue(`Association '${name}' requires a required, directly extracted local key.`);
    }
    for (const source of sources)
      if (
        source.association &&
        execution.associations?.[source.association]?.records.kind !== source.kind
      )
        issue('Association source kind must match its referenced records.');
    if (
      execution.setup?.some((action) => action.kind === 'wait' && action.condition.kind === 'field')
    )
      issue(
        'Setup waits cannot reference fields before extraction; use a readiness field condition.'
      );
    const conditions = [
      ...execution.ready,
      ...execution.empty,
      ...(execution.pagination?.end ?? []),
    ];
    for (const item of conditions)
      if (item.kind === 'field' && !intent.fields[item.field])
        issue(`Condition references missing field '${item.field}'.`);
    if (execution.transport === Transport.Http && requiresBrowser(execution))
      issue(
        'The selected strategy requires browser capabilities (due to network responses, setup actions, or visibility conditions). Set "strategy.transport" to "browser".',
        ['strategy', 'transport']
      );
  });

/** Wrap a lone valid source in the canonical array shape; leave all other input untouched. */
export function normalizeSingleFieldSources(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !('strategy' in raw)) return raw;
  const plan = raw as { strategy?: unknown };
  if (!plan.strategy || typeof plan.strategy !== 'object' || !('fields' in plan.strategy))
    return raw;
  const strategy = plan.strategy as { fields?: unknown };
  if (!strategy.fields || typeof strategy.fields !== 'object' || Array.isArray(strategy.fields))
    return raw;
  const fields = Object.fromEntries(
    Object.entries(strategy.fields).map(([key, value]) =>
      !Array.isArray(value) && sourceSchema.safeParse(value).success ? [key, [value]] : [key, value]
    )
  );
  return { ...plan, strategy: { ...strategy, fields } };
}
