import { ExtractionQuality } from './constants.js';
import type {
  DocumentSnapshot,
  ExtractionPlan,
  IntentField,
  PageExtraction,
  Scalar,
  Source,
} from './contracts.js';
import { evaluateCondition, getCheerioRoot, readPath } from './conditions.js';
import { convertFieldValue, recordIdentity } from './values.js';
import { evidenceValue, redactObject, redactText } from './evidence.js';
import { matchesRecord } from './recordFilter.js';
import type { SourceReaders, SourceRecord } from './sources.js';

export function createInitialExtraction(): PageExtraction {
  return {
    records: [],
    observedIdentities: [],
    validatedSourceRecords: 0,
    quality: ExtractionQuality.Complete,
    issues: [],
    sourcesUsed: {},
    evidence: [],
    ready: false,
    ended: false,
  };
}

export function buildHttpErrorExtraction(status: number): PageExtraction {
  const isBlocked = status === 401 || status === 403 || status === 429;
  return {
    ...createInitialExtraction(),
    quality: isBlocked ? ExtractionQuality.Blocked : ExtractionQuality.Inconclusive,
    issues: ['An HTTP error response cannot establish valid data.'],
  };
}

export function resolveAssociations(
  strategy: ExtractionPlan['strategy'],
  readers: SourceReaders,
  snapshot: DocumentSnapshot
): Record<string, SourceRecord[]> {
  return Object.fromEntries(
    Object.entries(strategy.associations ?? {}).map(([key, association]) => [
      key,
      readers[association.records.kind].select(snapshot, association.records),
    ])
  );
}

export function getOrderedDefinitions(
  intent: ExtractionPlan['intent'],
  strategy: ExtractionPlan['strategy']
): [string, IntentField][] {
  const localKeys = new Set(
    Object.values(strategy.associations ?? {}).map((association) => association.localField)
  );
  return Object.entries(intent.fields).sort(
    ([a], [b]) => Number(localKeys.has(b)) - Number(localKeys.has(a))
  );
}

export interface ExtractedField {
  name: string;
  value: Scalar;
  sourceIndex: number;
  source: Source;
  raw: unknown;
}

export interface FieldSourceFailure {
  source: Source;
  raw: unknown;
  reason: string;
}

export interface RecordExtractionOutput {
  record: Record<string, Scalar>;
  failures: Map<string, FieldSourceFailure[]>;
  evidence: PageExtraction['evidence'];
  hasUnhandledSourceError: boolean;
  unhandledErrors: string[];
}

export function extractFieldFromSources(params: {
  name: string;
  field: IntentField;
  sources: Source[];
  context: SourceRecord;
  record: Record<string, Scalar>;
  associations: Record<string, SourceRecord[]>;
  strategy: ExtractionPlan['strategy'];
  intent: ExtractionPlan['intent'];
  readers: SourceReaders;
  snapshot: DocumentSnapshot;
  onFail: (message: string) => void;
}): {
  value: Scalar;
  extracted?: ExtractedField;
  failures: FieldSourceFailure[];
  unhandledSourceError: string | null;
} {
  const {
    name,
    field,
    sources,
    context,
    record,
    associations,
    strategy,
    intent,
    readers,
    snapshot,
    onFail,
  } = params;

  let value: Scalar = null;
  let unhandledSourceError: string | null = null;
  const failures: FieldSourceFailure[] = [];
  let extracted: ExtractedField | undefined;

  for (let index = 0; index < sources.length; index++) {
    const source = sources[index]!;
    let sourceRecord = context;

    if (source.association) {
      const association = strategy.associations?.[source.association];
      if (!association) {
        onFail('Missing source association.');
        continue;
      }
      const localValue = record[association.localField];
      const matching =
        localValue === null || localValue === undefined
          ? []
          : (associations[source.association] ?? []).filter(
              (candidate) =>
                convertFieldValue(
                  readPath(candidate.value, association.foreignPath),
                  intent.fields[association.localField]!,
                  snapshot.url
                ) === localValue
            );

      if (matching.length !== 1) {
        onFail('Association must resolve exactly one entity by its explicit key.');
        continue;
      }
      sourceRecord = matching[0]!;
    }

    let raw: unknown;
    try {
      raw = readers[source.kind].read(snapshot, source, sourceRecord);
    } catch (sourceError) {
      const reason = sourceError instanceof Error ? sourceError.message : 'Source reading failed';
      unhandledSourceError ??= reason;
      failures.push({ source, raw: null, reason });
      continue;
    }

    value = convertFieldValue(raw, field, snapshot.url);
    if (value === null) {
      failures.push({
        source,
        raw: evidenceValue(raw),
        reason: raw == null ? 'No value at source' : 'Value cannot be converted to ' + field.type,
      });
    } else {
      extracted = { name, value, sourceIndex: index, source, raw };
      break;
    }
  }

  return { value, extracted, failures, unhandledSourceError };
}

export function extractSingleContextRecord(params: {
  context: SourceRecord;
  definitions: [string, IntentField][];
  strategy: ExtractionPlan['strategy'];
  intent: ExtractionPlan['intent'];
  associations: Record<string, SourceRecord[]>;
  readers: SourceReaders;
  snapshot: DocumentSnapshot;
  resultSourcesUsed: Record<string, number>;
  onFail: (message: string) => void;
}): RecordExtractionOutput {
  const {
    context,
    definitions,
    strategy,
    intent,
    associations,
    readers,
    snapshot,
    resultSourcesUsed,
    onFail,
  } = params;

  const record: Record<string, Scalar> = {};
  const failures = new Map<string, FieldSourceFailure[]>();
  const evidence: PageExtraction['evidence'] = [];
  const unhandledErrors: string[] = [];
  let hasUnhandledSourceError = false;

  for (const [name, field] of definitions) {
    const sources = strategy.fields[name] ?? [];
    const { value, extracted, failures: fieldFailures, unhandledSourceError } =
      extractFieldFromSources({
        name,
        field,
        sources,
        context,
        record,
        associations,
        strategy,
        intent,
        readers,
        snapshot,
        onFail,
      });

    if (fieldFailures.length > 0) {
      failures.set(name, fieldFailures);
    }

    if (extracted) {
      const key = `${name}#${extracted.sourceIndex}`;
      resultSourcesUsed[key] = (resultSourcesUsed[key] ?? 0) + 1;
      evidence.push({
        recordIdentity: '',
        field: name,
        sourceIndex: extracted.sourceIndex,
        source: extracted.source,
        raw: evidenceValue(extracted.raw),
        value: evidenceValue(extracted.value),
      });
    }

    if (value === null && unhandledSourceError) {
      hasUnhandledSourceError = true;
      unhandledErrors.push(unhandledSourceError);
      if (!field.required) onFail(unhandledSourceError);
    }

    record[name] = value;
  }

  return { record, failures, evidence, hasUnhandledSourceError, unhandledErrors };
}

export function validateSingleModeRecord(params: {
  output: RecordExtractionOutput;
  intent: ExtractionPlan['intent'];
  strategy: ExtractionPlan['strategy'];
  definitions: [string, IntentField][];
  result: PageExtraction;
  onFail: (message: string, reason?: PageExtraction['failureReason']) => void;
}): void {
  const { output, intent, strategy, definitions, result, onFail } = params;
  const { record, failures, evidence, hasUnhandledSourceError } = output;
  const identityFields = intent.identityFields ?? [];

  if (
    Object.entries(intent.fields).every(([key, field]) => !field.required || record[key] !== null)
  ) {
    result.validatedSourceRecords++;
  }

  if (identityFields.some((key) => record[key] === null || record[key] === undefined)) {
    onFail('Source record has no stable identity.', 'IDENTITY');
  }
  result.observedIdentities.push(recordIdentity(record, identityFields));

  const filters = strategy.filters ?? [];
  if (
    filters.some((filter) => record[filter.field] === null || record[filter.field] === undefined)
  ) {
    onFail('Cannot evaluate a filter without its required field.');
  }
  if (!matchesRecord(record, filters)) return;

  for (const [name, field] of definitions) {
    if (record[name] === null && field.required) {
      onFail(
        `Required field '${name}' is missing or invalid. Failed sources: ${JSON.stringify(redactObject(failures.get(name) ?? []))}`
      );
    }
  }

  if (hasUnhandledSourceError) return;

  const identity = recordIdentity(record, intent.identityFields);
  evidence.forEach((entry) => {
    entry.recordIdentity = redactText(identity);
  });
  result.evidence.push(...evidence);
  result.records.push(record);
}

export function validateCollectionModeRecord(params: {
  output: RecordExtractionOutput;
  intent: ExtractionPlan['intent'];
  strategy: ExtractionPlan['strategy'];
  definitions: [string, IntentField][];
  result: PageExtraction;
}): void {
  const { output, intent, strategy, definitions, result } = params;
  const { record, evidence, hasUnhandledSourceError } = output;
  const identityFields = intent.identityFields ?? [];

  // Collection mode: tolerate spurious / layout / ad nodes.
  const hasIdentity =
    identityFields.length === 0 ||
    identityFields.every(
      (key) => record[key] !== null && record[key] !== undefined && record[key] !== ''
    );
  const missingRequired = definitions.some(
    ([name, field]) =>
      field.required && (record[name] === null || record[name] === undefined || record[name] === '')
  );

  if (!hasIdentity || missingRequired || hasUnhandledSourceError) {
    return;
  }

  result.validatedSourceRecords++;
  const identity = recordIdentity(record, intent.identityFields);
  result.observedIdentities.push(identity);

  const filters = strategy.filters ?? [];
  if (
    filters.some((filter) => record[filter.field] === null || record[filter.field] === undefined)
  ) {
    return;
  }
  if (!matchesRecord(record, filters)) return;

  evidence.forEach((entry) => {
    entry.recordIdentity = redactText(identity);
  });
  result.evidence.push(...evidence);
  result.records.push(record);
}

export function validateCollectionIntegrity(params: {
  strategy: ExtractionPlan['strategy'];
  intent: ExtractionPlan['intent'];
  result: PageExtraction;
  contextsLength: number;
  onFail: (message: string) => void;
}): void {
  const { strategy, intent, result, contextsLength, onFail } = params;

  if (contextsLength > 0 && result.validatedSourceRecords === 0) {
    const containerDesc =
      strategy.records.kind === 'dom' ? `'${strategy.records.selector}'` : strategy.records.kind;
    onFail(
      `No valid records could be extracted from candidate items (${contextsLength} matched ${containerDesc}). Check field selectors.`
    );
  }

  const seen = new Set<string>();
  for (const record of result.records) {
    const identity = recordIdentity(record, intent.identityFields);
    if (seen.has(identity)) {
      const idPreview = identity ? `'${redactText(identity)}'` : '(empty)';
      onFail(
        `Duplicate collection identity for ${idPreview}. Multiple records share the same identity fields [${intent.identityFields.join(', ')}]. Narrow the record container selector to target the primary content feed, or use composite identityFields.`
      );
    }
    seen.add(identity);
  }
}

export function evaluateReadinessAndQuality(params: {
  strategy: ExtractionPlan['strategy'];
  snapshot: DocumentSnapshot;
  candidates: Record<string, Scalar>[];
  observed?: Map<string, boolean>;
  result: PageExtraction;
  contextsLength: number;
}): void {
  const { strategy, snapshot, candidates, observed, result, contextsLength } = params;

  const all = (conditions: typeof strategy.ready) =>
    conditions.length > 0 &&
    conditions.every((condition) => evaluateCondition(condition, snapshot, candidates, observed));

  const failedReady = strategy.ready.filter(
    (condition) => !evaluateCondition(condition, snapshot, candidates, observed)
  );

  result.ready = failedReady.length === 0 && strategy.ready.length > 0;
  result.ended = !strategy.pagination || all(strategy.pagination.end);

  if (result.quality !== ExtractionQuality.Invalid) {
    if (!result.ready) {
      result.failureReason = 'READINESS';
      result.quality = ExtractionQuality.Inconclusive;
      const details = failedReady.map((c) => JSON.stringify(c)).join(', ');
      result.issues.push(
        `Readiness conditions were not satisfied: ${details}. Verify that the ready selector exists in the rendered DOM.`
      );
    } else if (!result.records.length) {
      const isPositiveEmpty =
        all(strategy.empty) ||
        Boolean(
          strategy.filters?.length &&
            contextsLength > 0 &&
            result.validatedSourceRecords === contextsLength
        );

      result.quality = isPositiveEmpty ? ExtractionQuality.Empty : ExtractionQuality.Inconclusive;
      if (result.quality === ExtractionQuality.Inconclusive) {
        result.issues.push('No records without positive empty-state evidence.');
      }
    }
  }
}

export function extractNextPageUrl(
  snapshot: DocumentSnapshot,
  pagination?: ExtractionPlan['strategy']['pagination']
): string | undefined {
  if (pagination?.next?.kind === 'css') {
    const href = getCheerioRoot(snapshot)(pagination.next.selector).first().attr('href');
    if (href) {
      try {
        return new URL(href, snapshot.url).href;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
