import { ExtractionMode, ExtractionQuality } from './constants.js';
import { matchesRecord } from './recordFilter.js';
import * as cheerio from 'cheerio';
import type { DocumentSnapshot, ExtractionPlan, PageExtraction, Scalar } from './contracts.js';
import { evaluateCondition, readPath } from './conditions.js';
import { convertFieldValue, recordIdentity } from './values.js';
import { evidenceValue, redactObject, redactText } from './evidence.js';
import type { SourceReaders } from './sources.js';

export interface IPageExtractor {
  extract(
    snapshot: DocumentSnapshot,
    plan: ExtractionPlan,
    observed?: Map<string, boolean>
  ): PageExtraction;
}

export class PageExtractor implements IPageExtractor {
  constructor(private readonly readers: SourceReaders) {}
  extract(
    snapshot: DocumentSnapshot,
    plan: ExtractionPlan,
    observed?: Map<string, boolean>
  ): PageExtraction {
    const { intent, strategy } = plan;
    const result: PageExtraction = {
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
    if (snapshot.httpStatus >= 400)
      return {
        ...result,
        quality:
          snapshot.httpStatus === 401 || snapshot.httpStatus === 403 || snapshot.httpStatus === 429
            ? ExtractionQuality.Blocked
            : ExtractionQuality.Inconclusive,
        issues: ['An HTTP error response cannot establish valid data.'],
      };
    const fail = (message: string) => {
      result.quality = ExtractionQuality.Invalid;
      if (!result.issues.includes(message)) result.issues.push(message);
    };
    try {
      const contexts = this.readers[strategy.records.kind].select(snapshot, strategy.records);
      if (intent.mode === ExtractionMode.Single && contexts.length !== 1)
        fail('A single entity must be selected unambiguously.');
      const associations = Object.fromEntries(
        Object.entries(strategy.associations ?? {}).map(([key, association]) => [
          key,
          this.readers[association.records.kind].select(snapshot, association.records),
        ])
      );
      const localKeys = new Set(
        Object.values(strategy.associations ?? {}).map((association) => association.localField)
      );
      const definitions = Object.entries(intent.fields).sort(
        ([a], [b]) => Number(localKeys.has(b)) - Number(localKeys.has(a))
      );
      const candidates: Record<string, Scalar>[] = [];
      for (const context of contexts) {
        const record: Record<string, Scalar> = {};
        const failures = new Map<string, unknown[]>();
        const evidence: PageExtraction['evidence'] = [];
        let hasUnhandledSourceError = false;
        for (const [name, field] of definitions) {
          let value: Scalar = null;
          let unhandledSourceError: string | null = null;
          const sources = strategy.fields[name] ?? [];
          for (let index = 0; index < sources.length; index++) {
            const source = sources[index]!;
            let sourceRecord = context;
            if (source.association) {
              const association = strategy.associations?.[source.association];
              if (!association) {
                fail('Missing source association.');
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
                fail('Association must resolve exactly one entity by its explicit key.');
                continue;
              }
              sourceRecord = matching[0]!;
            }
            let raw: unknown;
            try {
              raw = this.readers[source.kind].read(snapshot, source, sourceRecord);
            } catch (sourceError) {
              const reason =
                sourceError instanceof Error ? sourceError.message : 'Source reading failed';
              unhandledSourceError ??= reason;
              const readings = failures.get(name) ?? [];
              readings.push({
                source,
                raw: null,
                reason,
              });
              failures.set(name, readings);
              continue;
            }
            value = convertFieldValue(raw, field, snapshot.url);
            if (value === null) {
              const readings = failures.get(name) ?? [];
              readings.push({
                source,
                raw: evidenceValue(raw),
                reason:
                  raw == null ? 'No value at source' : 'Value cannot be converted to ' + field.type,
              });
              failures.set(name, readings);
            }
            if (value !== null) {
              const key = name + '#' + index;
              result.sourcesUsed[key] = (result.sourcesUsed[key] ?? 0) + 1;
              evidence.push({
                recordIdentity: '',
                field: name,
                sourceIndex: index,
                source,
                raw: evidenceValue(raw),
                value: evidenceValue(value),
              });
              break;
            }
          }
          if (value === null && unhandledSourceError) {
            hasUnhandledSourceError = true;
            if (!field.required) fail(unhandledSourceError);
          }
          record[name] = value;
        }
        candidates.push(record);
        const identityFields = intent.identityFields ?? [];

        if (intent.mode === ExtractionMode.Single) {
          if (
            Object.entries(intent.fields).every(
              ([key, field]) => !field.required || record[key] !== null
            )
          )
            result.validatedSourceRecords++;

          if (identityFields.some((key) => record[key] === null || record[key] === undefined))
            fail('Source record has no stable identity.');
          result.observedIdentities.push(recordIdentity(record, identityFields));

          const filters = strategy.filters ?? [];
          if (
            filters.some(
              (filter) => record[filter.field] === null || record[filter.field] === undefined
            )
          )
            fail('Cannot evaluate a filter without its required field.');
          if (!matchesRecord(record, filters)) continue;

          for (const [name, field] of definitions)
            if (record[name] === null && field.required)
              fail(
                `Required field '${name}' is missing or invalid. Failed sources: ${JSON.stringify(redactObject(failures.get(name) ?? []))}`
              );

          if (hasUnhandledSourceError) continue;

          const identity = recordIdentity(record, intent.identityFields);
          evidence.forEach((entry) => {
            entry.recordIdentity = redactText(identity);
          });
          result.evidence.push(...evidence);
          result.records.push(record);
        } else {
          // Collection mode: tolerate spurious / layout / ad nodes.
          const hasIdentity =
            identityFields.length === 0 ||
            identityFields.every(
              (key) => record[key] !== null && record[key] !== undefined && record[key] !== ''
            );
          const missingRequired = definitions.some(
            ([name, field]) =>
              field.required &&
              (record[name] === null || record[name] === undefined || record[name] === '')
          );

          if (!hasIdentity || missingRequired || hasUnhandledSourceError) {
            continue;
          }

          result.validatedSourceRecords++;
          const identity = recordIdentity(record, intent.identityFields);
          result.observedIdentities.push(identity);

          const filters = strategy.filters ?? [];
          if (
            filters.some(
              (filter) => record[filter.field] === null || record[filter.field] === undefined
            )
          ) {
            continue;
          }
          if (!matchesRecord(record, filters)) continue;

          evidence.forEach((entry) => {
            entry.recordIdentity = redactText(identity);
          });
          result.evidence.push(...evidence);
          result.records.push(record);
        }
      }

      if (intent.mode === ExtractionMode.Collection) {
        if (contexts.length > 0 && result.validatedSourceRecords === 0) {
          const containerDesc = strategy.records.kind === 'dom' ? `'${strategy.records.selector}'` : strategy.records.kind;
          fail(`No valid records could be extracted from candidate items (${contexts.length} matched ${containerDesc}). Check field selectors.`);
        }

        const seen = new Set<string>();
        for (const record of result.records) {
          const identity = recordIdentity(record, intent.identityFields);
          if (seen.has(identity)) {
            const idPreview = identity ? `'${redactText(identity)}'` : '(empty)';
            fail(
              `Duplicate collection identity for ${idPreview}. Multiple records share the same identity fields [${intent.identityFields.join(', ')}]. Narrow the record container selector to target the primary content feed, or use composite identityFields.`
            );
          }
          seen.add(identity);
        }
      }
      const all = (conditions: typeof strategy.ready) =>
        conditions.length > 0 &&
        conditions.every((condition) =>
          evaluateCondition(condition, snapshot, candidates, observed)
        );
      const failedReady = strategy.ready.filter(
        (condition) => !evaluateCondition(condition, snapshot, candidates, observed)
      );
      result.ready = failedReady.length === 0 && strategy.ready.length > 0;
      result.ended = !strategy.pagination || all(strategy.pagination.end);
      if (result.quality !== ExtractionQuality.Invalid) {
        if (!result.ready) {
          result.quality = ExtractionQuality.Inconclusive;
          const details = failedReady.map((c) => JSON.stringify(c)).join(', ');
          result.issues.push(
            `Readiness conditions were not satisfied: ${details}. Verify that the ready selector exists in the rendered DOM.`
          );
        } else if (!result.records.length) {
          result.quality =
            all(strategy.empty) ||
            (strategy.filters?.length &&
              contexts.length &&
              result.validatedSourceRecords === contexts.length)
              ? ExtractionQuality.Empty
              : ExtractionQuality.Inconclusive;
          if (result.quality === ExtractionQuality.Inconclusive)
            result.issues.push('No records without positive empty-state evidence.');
        }
      }
      const next = strategy.pagination?.next;
      if (next?.kind === 'css') {
        const href = cheerio.load(snapshot.html)(next.selector).first().attr('href');
        if (href) result.nextUrl = new URL(href, snapshot.url).href;
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Page extraction failed.');
    }
    return result;
  }
}
