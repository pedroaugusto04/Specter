import { triggerOperatorsForType } from '@specter/contracts';
import { requiresBrowser } from '../extraction/capabilities.js';
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
import { detectDocumentLocale, normalizeLocaleTag } from '../utils/localeDetector.js';

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
        })
        .default('text'),
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
  description: text.default('Field'),
  required: z.boolean().default(true),
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

function validateIntentAndScope(
  intent: z.infer<typeof extractionIntentSchema>,
  strategy: z.infer<typeof executionStrategySchema>,
  issue: (message: string, path?: (string | number)[]) => void
) {
  if (strategy.pagination && intent.scope !== ExtractionScope.Collection) {
    issue('Pagination requires collection scope.', ['intent', 'scope']);
  }

  if (
    intent.mode === ExtractionMode.Single &&
    (intent.scope !== ExtractionScope.Page ||
      strategy.pagination ||
      intent.identityFields.length)
  ) {
    issue('Single entities require page scope, no pagination, and empty identityFields.', [
      'intent',
    ]);
  }

  if (new Set(intent.identityFields).size !== intent.identityFields.length) {
    issue('Identity fields must not repeat.', ['intent', 'identityFields']);
  }

  if (intent.mode === ExtractionMode.Collection && !intent.identityFields.length) {
    issue('Collections require stable identity fields.', ['intent', 'identityFields']);
  }
}

function validateFieldMappings(
  intent: z.infer<typeof extractionIntentSchema>,
  strategy: z.infer<typeof executionStrategySchema>,
  issue: (message: string, path?: (string | number)[]) => void
) {
  const intentKeys = Object.keys(intent.fields);
  if (!intentKeys.length) {
    issue('At least one field is required.', ['intent', 'fields']);
  }

  const sortedIntent = [...intentKeys].sort().join(',');
  const sortedStrategy = Object.keys(strategy.fields).sort().join(',');
  if (sortedIntent !== sortedStrategy) {
    issue('Execution fields must exactly match intent fields.', ['strategy', 'fields']);
  }

  for (const [key, field] of Object.entries(intent.fields)) {
    if (field.type === FieldType.Boolean) {
      const keys = Object.keys(field.booleanValues ?? {});
      if (!keys.length) {
        issue(`Boolean field '${key}' requires an explicit value mapping.`, [
          'intent',
          'fields',
          key,
          'booleanValues',
        ]);
      }
      const hasInvalidKey = keys.some(
        (val) => val !== val.toLowerCase().replace(/\s+/g, ' ').trim() || !val
      );
      if (hasInvalidKey) {
        issue(`Boolean mapping keys for '${key}' must be lowercase with normalized whitespace.`);
      }
    }

    if ((field.type === FieldType.Number || field.type === FieldType.Date) && field.locale) {
      try {
        new Intl.NumberFormat(field.locale);
      } catch {
        issue(`Invalid locale for '${key}'.`, ['intent', 'fields', key, 'locale']);
      }
    }
  }
}

function validateTriggerAndFilterRules(
  intent: z.infer<typeof extractionIntentSchema>,
  strategy: z.infer<typeof executionStrategySchema>,
  issue: (message: string, path?: (string | number)[]) => void
) {
  const referencedKeys = [
    ...intent.identityFields,
    ...intent.triggerRules.map((rule) => rule.field),
  ];
  for (const key of referencedKeys) {
    if (!intent.fields[key]?.required) {
      issue(`Referenced field '${key}' must exist and be required.`, ['intent', 'fields', key]);
    }
  }

  for (const filter of strategy.filters ?? []) {
    if (!intent.fields[filter.field]?.required) {
      issue('Record filters require a declared, required field.');
    }
  }

  const allRules = [...intent.triggerRules, ...(strategy.filters ?? [])];
  for (const rule of allRules) {
    const field = intent.fields[rule.field];
    if (!field) continue;

    if (!triggerOperatorsForType(field.type).includes(rule.operator)) {
      issue(`Operator '${rule.operator}' is incompatible with field '${rule.field}'.`);
    }

    const isNumericRelative =
      rule.operator === TriggerOperator.Changes ||
      rule.operator === TriggerOperator.Decreased ||
      rule.operator === TriggerOperator.Increased;

    if (
      field.type === FieldType.Number &&
      !isNumericRelative &&
      (typeof rule.value !== 'number' || !Number.isFinite(rule.value))
    ) {
      issue(`Numeric rule '${rule.field}' requires a finite numeric threshold.`);
    }

    const isTextPattern =
      rule.operator === TriggerOperator.Contains ||
      rule.operator === TriggerOperator.NotContains;

    if (isTextPattern && typeof rule.value !== 'string') {
      issue(`Text rule '${rule.field}' requires a string threshold.`);
    }

    if (rule.operator === TriggerOperator.Equal || rule.operator === TriggerOperator.NotEqual) {
      const expectedType =
        field.type === FieldType.Number
          ? 'number'
          : field.type === FieldType.Boolean
            ? 'boolean'
            : 'string';

      if (typeof rule.value !== expectedType) {
        issue(`Rule '${rule.field}' has an incompatible threshold type.`);
      }
    }
  }
}

function validateSourcesAndAssociations(
  intent: z.infer<typeof extractionIntentSchema>,
  strategy: z.infer<typeof executionStrategySchema>,
  issue: (message: string, path?: (string | number)[]) => void
) {
  const sources = Object.values(strategy.fields).flat();

  const invalidSourceKind = sources.some(
    (item) => item.kind !== strategy.records.kind && !item.association
  );
  if (invalidSourceKind) {
    issue(
      'Field sources must belong to the selected record source or reference an explicit key association.'
    );
  }

  for (const [name, assoc] of Object.entries(strategy.associations ?? {})) {
    const localField = intent.fields[assoc.localField];
    const hasAssocSource = strategy.fields[assoc.localField]?.some((s) => s.association);
    if (!localField?.required || hasAssocSource) {
      issue(`Association '${name}' requires a required, directly extracted local key.`);
    }
  }

  for (const source of sources) {
    if (
      source.association &&
      strategy.associations?.[source.association]?.records.kind !== source.kind
    ) {
      issue('Association source kind must match its referenced records.');
    }
  }
}

function validateConditionsAndTransport(
  intent: z.infer<typeof extractionIntentSchema>,
  strategy: z.infer<typeof executionStrategySchema>,
  issue: (message: string, path?: (string | number)[]) => void
) {
  if (strategy.pagination && strategy.pagination.kind !== 'scroll' && !strategy.pagination.next) {
    issue('Link and click pagination require a next locator.', [
      'strategy',
      'pagination',
      'next',
    ]);
  }

  if (strategy.setup?.some((a) => a.kind === 'wait' && a.condition.kind === 'field')) {
    issue(
      'Setup waits cannot reference fields before extraction; use a readiness field condition.'
    );
  }

  const conditions = [
    ...strategy.ready,
    ...strategy.empty,
    ...(strategy.pagination?.end ?? []),
  ];
  for (const item of conditions) {
    if (item.kind === 'field' && !intent.fields[item.field]) {
      issue(`Condition references missing field '${item.field}'.`);
    }
  }

  if (strategy.transport === Transport.Http && requiresBrowser(strategy)) {
    issue(
      'The selected strategy requires browser capabilities (due to network responses, setup actions, or visibility conditions). Set "strategy.transport" to "browser".',
      ['strategy', 'transport']
    );
  }
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

    validateIntentAndScope(plan.intent, plan.strategy, issue);
    validateFieldMappings(plan.intent, plan.strategy, issue);
    validateTriggerAndFilterRules(plan.intent, plan.strategy, issue);
    validateSourcesAndAssociations(plan.intent, plan.strategy, issue);
    validateConditionsAndTransport(plan.intent, plan.strategy, issue);
  });

function normalizeLocatorValue(loc: unknown): unknown {
  if (typeof loc === 'string') {
    return { kind: 'css', selector: loc };
  }
  if (
    loc &&
    typeof loc === 'object' &&
    !('kind' in loc) &&
    'selector' in loc &&
    typeof (loc as Record<string, unknown>).selector === 'string'
  ) {
    return { kind: 'css', ...(loc as Record<string, unknown>) };
  }
  return loc;
}

function normalizeConditionValue(cond: unknown): unknown {
  if (!cond || typeof cond !== 'object') return cond;
  const c = cond as Record<string, unknown>;
  if ('locator' in c) {
    return { ...c, locator: normalizeLocatorValue(c.locator) };
  }
  return cond;
}

/**
 * Normalizes input objects before validation:
 * 1. Intent fields: fills missing description (from displayName or field key),
 *    defaults required to true, and derives locale from snapshot/document or falls back to 'en-US'.
 * 2. Strategy fields: wraps lone valid sources in arrays and normalizes string/selector locators.
 */
export function normalizeCandidatePlan(
  raw: unknown,
  snapshot?: { html?: string; url?: string } | string | null
): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const plan = { ...(raw as Record<string, unknown>) };

  if (plan.intent && typeof plan.intent === 'object') {
    const intent = { ...(plan.intent as Record<string, unknown>) };
    if (intent.fields && typeof intent.fields === 'object' && !Array.isArray(intent.fields)) {
      const docLocale = detectDocumentLocale(snapshot);
      const fields: Record<string, unknown> = {};

      for (const [key, fieldVal] of Object.entries(intent.fields)) {
        if (!fieldVal || typeof fieldVal !== 'object') {
          fields[key] = fieldVal;
          continue;
        }

        const field = { ...(fieldVal as Record<string, unknown>) };

        if (typeof field.displayName === 'string' && !field.displayName.trim()) {
          delete field.displayName;
        }
        if (typeof field.observedLabel === 'string' && !field.observedLabel.trim()) {
          delete field.observedLabel;
        }

        if (typeof field.description !== 'string' || !field.description.trim()) {
          field.description =
            typeof field.displayName === 'string' && field.displayName.trim()
              ? field.displayName.trim()
              : key;
        }

        if (field.required === undefined) {
          field.required = true;
        }

        if (field.type === FieldType.Number || field.type === FieldType.Date) {
          if (typeof field.locale !== 'string' || !field.locale.trim()) {
            field.locale = docLocale;
          } else {
            const normalized = normalizeLocaleTag(field.locale);
            field.locale = normalized ?? docLocale;
          }
        }

        fields[key] = field;
      }

      intent.fields = fields;
    }
    plan.intent = intent;
  }

  if (plan.strategy && typeof plan.strategy === 'object') {
    const strategy = { ...(plan.strategy as Record<string, unknown>) };

    if (strategy.fields && typeof strategy.fields === 'object' && !Array.isArray(strategy.fields)) {
      strategy.fields = Object.fromEntries(
        Object.entries(strategy.fields).map(([key, value]) =>
          !Array.isArray(value) && sourceSchema.safeParse(value).success
            ? [key, [value]]
            : [key, value]
        )
      );
    }

    if (Array.isArray(strategy.setup)) {
      strategy.setup = strategy.setup.map((action: unknown) => {
        if (!action || typeof action !== 'object') return action;
        const a = action as Record<string, unknown>;
        if (a.kind === 'click' && 'locator' in a) {
          return { ...a, locator: normalizeLocatorValue(a.locator) };
        }
        if (a.kind === 'wait' && a.condition) {
          return { ...a, condition: normalizeConditionValue(a.condition) };
        }
        return action;
      });
    }

    if (Array.isArray(strategy.ready)) {
      strategy.ready = strategy.ready.map(normalizeConditionValue);
    }

    if (Array.isArray(strategy.empty)) {
      strategy.empty = strategy.empty.map(normalizeConditionValue);
    }

    if (strategy.pagination && typeof strategy.pagination === 'object') {
      const pag = { ...(strategy.pagination as Record<string, unknown>) };
      if ('next' in pag) {
        pag.next = normalizeLocatorValue(pag.next);
      }
      if (Array.isArray(pag.end)) {
        pag.end = pag.end.map(normalizeConditionValue);
      }
      strategy.pagination = pag;
    }

    plan.strategy = strategy;
  }

  return plan;
}
