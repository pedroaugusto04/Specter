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
      selector: text,
      attribute: text.refine((attribute) => !['textContent', 'innerText'].includes(attribute), {
        message: 'Use "text" to read DOM text.',
      }),
      pattern: text.optional(),
      association: text.optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal(SourceKind.JsonLd), path: path.min(1), association: text.optional() })
    .strict(),
  z.object({ kind: z.literal(SourceKind.Response), path, association: text.optional() }).strict(),
]);
export const extractionIntentSchema = z
  .object({
    entity: text,
    mode: z.nativeEnum(ExtractionMode),
    scope: z.nativeEnum(ExtractionScope),
    fields: z.record(
      z.string().regex(/^[a-z][a-z0-9_]*$/),
      z
        .object({
          displayName: text.optional(),
          observedLabel: text.optional(),
          description: text,
          type: z.nativeEnum(FieldType),
          required: z.boolean(),
          normalizeVolatileText: z.boolean().optional(),
          locale: text.optional(),
          booleanValues: z.record(z.boolean()).optional(),
        })
        .strict()
    ),
    identityFields: z.array(text).default([]),
    filters: z.array(text).default([]),
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

export function normalizeExtractionCandidate(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'strategy' in raw) {
    const plan = raw as { strategy?: unknown; intent?: unknown };
    let nextStrategy = plan.strategy;
    let nextIntent = plan.intent;
    let modified = false;

    if (nextStrategy && typeof nextStrategy === 'object') {
      const s = { ...(nextStrategy as Record<string, unknown>) } as unknown as ExecutionStrategy;
      if (s.transport === Transport.Http && requiresBrowser(s)) {
        s.transport = Transport.Browser;
        nextStrategy = s;
        modified = true;
      }
    }

    if (nextIntent && typeof nextIntent === 'object') {
      const intentObj = { ...(nextIntent as Record<string, unknown>) };
      const hasPagination = Boolean(
        nextStrategy &&
          typeof nextStrategy === 'object' &&
          'pagination' in nextStrategy &&
          (nextStrategy as { pagination?: unknown }).pagination
      );

      if (hasPagination) {
        if (
          intentObj.scope !== ExtractionScope.Collection ||
          intentObj.mode !== ExtractionMode.Collection
        ) {
          intentObj.scope = ExtractionScope.Collection;
          intentObj.mode = ExtractionMode.Collection;
          modified = true;
        }
      } else if (intentObj.scope === ExtractionScope.Collection) {
        intentObj.scope = ExtractionScope.Page;
        modified = true;
      }

      if (intentObj.mode === ExtractionMode.Collection) {
        let identities = Array.isArray(intentObj.identityFields) ? [...intentObj.identityFields] : [];
        if (!identities.length && intentObj.fields && typeof intentObj.fields === 'object') {
          identities = Object.keys(intentObj.fields as Record<string, unknown>);
          intentObj.identityFields = identities;
          modified = true;
        }
        if (identities.length > 0 && intentObj.fields && typeof intentObj.fields === 'object') {
          const fieldsObj = { ...(intentObj.fields as Record<string, Record<string, unknown>>) };
          let fieldsModified = false;
          for (const idKey of identities) {
            if (fieldsObj[idKey] && typeof fieldsObj[idKey] === 'object' && !fieldsObj[idKey].required) {
              fieldsObj[idKey] = { ...fieldsObj[idKey], required: true };
              fieldsModified = true;
            }
          }
          if (fieldsModified) {
            intentObj.fields = fieldsObj;
            modified = true;
          }
        }
      }

      if (modified) {
        nextIntent = intentObj;
      }
    }

    if (modified) {
      return {
        ...raw,
        strategy: nextStrategy,
        intent: nextIntent,
      };
    }
  }
  return raw;
}
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
    for (const rule of intent.triggerRules) {
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
      if (field.type === FieldType.Number && !field.locale)
        issue(`Numeric field '${key}' requires an explicit locale (e.g. "pt-BR" or "en-US").`, [
          'intent',
          'fields',
          key,
          'locale',
        ]);
      if (field.locale) {
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
      intent.scope === ExtractionScope.Collection &&
      (intent.mode !== ExtractionMode.Collection || !execution.pagination)
    )
      issue(
        'Full collection scope requires pagination and collection mode. Set intent.scope to "page" if extracting records from a single page without pagination.',
        ['intent', 'scope']
      );
    if (execution.pagination && intent.scope !== ExtractionScope.Collection)
      issue('Pagination requires collection scope.', ['strategy', 'pagination']);
    if (
      execution.pagination &&
      execution.pagination.kind !== 'scroll' &&
      !execution.pagination.next
    )
      issue('Link and click pagination require a next locator.', ['strategy', 'pagination', 'next']);
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
