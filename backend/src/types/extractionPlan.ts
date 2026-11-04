import { z } from 'zod';
import { ExtractionQuality, TriggerOperator } from './enums.js';
export { ExtractionQuality, TriggerOperator };
export type {
  ExtractionPlan,
  ExtractionIntent,
  IntentField as ExtractionField,
  TriggerRule,
  SemanticPolicy,
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
const match = z.object({ urlPattern: text, method: text.optional() }).strict();
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
      kind: z.literal('response'),
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
const source = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('dom'),
      selector: text,
      attribute: text,
      association: text.optional(),
    })
    .strict(),
  z.object({ kind: z.literal('jsonld'), path: path.min(1), association: text.optional() }).strict(),
  z.object({ kind: z.literal('response'), path, association: text.optional() }).strict(),
]);
export const semanticPolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    threshold: z.number().int().min(0).max(10).optional(),
  })
  .strict();
export const extractionIntentSchema = z
  .object({
    entity: text,
    mode: z.enum(['single', 'collection']),
    scope: z.enum(['page', 'collection']),
    fields: z.record(
      z.string().regex(/^[a-z][a-z0-9_]*$/),
      z
        .object({
          description: text,
          type: z.enum(['string', 'number', 'boolean', 'date', 'url']),
          required: z.boolean(),
          normalizeVolatileText: z.boolean().optional(),
          locale: text.optional(),
          booleanValues: z.record(z.boolean()).optional(),
        })
        .strict()
    ),
    identityFields: z.array(text),
    filters: z.array(text),
    triggerRules: z.array(
      z
        .object({
          field: text,
          operator: z.nativeEnum(TriggerOperator),
          value: z.union([z.string(), z.number().finite(), z.boolean()]),
        })
        .strict()
    ),
    triggerMatchMode: z.enum(['all', 'any']),
  })
  .strict();
export const executionStrategySchema = z
  .object({
    transport: z.enum(['http', 'browser']),
    setup: z.array(discoveryActionSchema).optional(),
    document: z.object({ frame: text.optional(), shadow: text.optional() }).strict().optional(),
    records: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('dom'), selector: text }).strict(),
      z.object({ kind: z.literal('jsonld'), type: text }).strict(),
      z.object({ kind: z.literal('response'), match, path }).strict(),
    ]),
    filters: z
      .array(
        z
          .object({
            field: text,
            operator: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains', 'not_contains']),
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
              z.object({ kind: z.literal('jsonld'), type: text }).strict(),
              z.object({ kind: z.literal('response'), match, path }).strict(),
            ]),
          })
          .strict()
      )
      .optional(),
    fields: z.record(text, z.array(source).min(1)),
    ready: z.array(conditionSchema).min(1),
    empty: z.array(conditionSchema),
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
    version: z.literal(3),
    intent: extractionIntentSchema,
    strategy: executionStrategySchema,
  })
  .strict()
  .superRefine((plan, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const { intent, strategy: execution } = plan;
    if (!Object.keys(intent.fields).length) issue('At least one field is required.');
    if (
      JSON.stringify(Object.keys(intent.fields).sort()) !==
      JSON.stringify(Object.keys(execution.fields).sort())
    )
      issue('Execution fields must exactly match intent fields.');
    for (const key of [...intent.identityFields, ...intent.triggerRules.map((rule) => rule.field)])
      if (!intent.fields[key]?.required)
        issue(`Referenced field '${key}' must exist and be required.`);
    for (const [key, field] of Object.entries(intent.fields)) {
      if (field.type === 'number' && !field.locale)
        issue(`Numeric field '${key}' requires an explicit locale.`);
      if (field.locale) {
        try {
          new Intl.NumberFormat(field.locale);
        } catch {
          issue(`Invalid locale for '${key}'.`);
        }
      }
      if (field.type === 'boolean' && !Object.keys(field.booleanValues ?? {}).length)
        issue(`Boolean field '${key}' requires an explicit value mapping.`);
    }
    if (intent.mode === 'collection' && !intent.identityFields.length)
      issue('Collections require stable identity fields.');
    if (intent.scope === 'collection' && (intent.mode !== 'collection' || !execution.pagination))
      issue('Full collection scope requires pagination and collection mode.');
    if (execution.pagination && intent.scope !== 'collection')
      issue('Pagination requires collection scope.');
    if (
      execution.pagination &&
      execution.pagination.kind !== 'scroll' &&
      !execution.pagination.next
    )
      issue('Link and click pagination require a next locator.');
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
    if (
      execution.transport === 'http' &&
      (execution.setup?.length ||
        execution.document ||
        execution.records.kind === 'response' ||
        Object.values(execution.associations ?? {}).some(
          (association) => association.records.kind === 'response'
        ) ||
        execution.pagination?.kind === 'click' ||
        execution.pagination?.kind === 'scroll' ||
        conditions.some(
          (item) =>
            item.kind === 'visible' ||
            item.kind === 'response' ||
            ('locator' in item && item.locator.kind === 'role')
        ))
    )
      issue('The selected strategy requires browser capabilities.');
  });
