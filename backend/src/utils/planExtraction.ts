import { sanitizeVolatileString } from './diffHasher.js';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { ExtractionField, ExtractionPlan, ExtractionReport } from '../types/extractionPlan.js';
import {
  ExtractionMode,
  ExtractionQuality,
  ExtractionSourceKind,
  DOM_TEXT_ATTRIBUTE,
  FieldValueType,
} from '../types/enums.js';
import type { ExtractedPayload, ExtractedRecord } from '../types/extractor.js';

export function convertFieldValue(
  value: unknown,
  field: ExtractionField,
  baseUrl: string
): string | number | boolean | null {
  if (value === null || value === undefined || typeof value === 'object') return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  switch (field.type) {
    case FieldValueType.String:
      return field.normalizeVolatileText ? sanitizeVolatileString(text) : text;
    case FieldValueType.Boolean:
      return field.booleanValues?.[text.toLowerCase()] ?? null;
    case FieldValueType.Url: {
      try {
        const url = new URL(text, baseUrl);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
      } catch {
        return null;
      }
    }
    case FieldValueType.Date: {
      if (
        !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(text)
      )
        return null;
      const date = new Date(text);
      return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }
    case FieldValueType.Number: {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      const parts = new Intl.NumberFormat(field.locale).formatToParts(12345.6);
      const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
      const group = parts.find((p) => p.type === 'group')?.value ?? ',';
      const stripped = text.replace(/[^\d.,+\-\s]/g, '').trim();
      const normalized = stripped.split(group).join('').replace(decimal, '.');
      if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
      const number = Number(normalized);
      return Number.isFinite(number) ? number : null;
    }
  }
}

export function recordIdentity(record: ExtractedRecord, fields: string[]): string {
  return JSON.stringify(fields.map((field) => record[field]));
}

export function extractPlanPage(
  html: string,
  url: string,
  plan: ExtractionPlan
): { data: ExtractedPayload; report: ExtractionReport; nextUrl?: string; ended: boolean } {
  const $ = cheerio.load(html);
  const report: ExtractionReport = {
    quality: ExtractionQuality.Complete,
    scope: plan.scope,
    pagesVisited: 1,
    issues: [],
    sourcesUsed: {},
  };
  const fail = (message: string) => {
    report.quality = ExtractionQuality.Invalid;
    report.issues.push(message);
  };
  const nodes: Record<string, unknown>[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      const node = value as Record<string, unknown>;
      nodes.push(node);
      if (node['@graph']) visit(node['@graph']);
    }
  };
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      visit(JSON.parse($(element).html() ?? ''));
    } catch {
      /* Invalid blocks cannot supply evidence. */
    }
  });
  const typedEntities = nodes.filter(
    (node) => !plan.jsonLdType || [node['@type']].flat().includes(plan.jsonLdType)
  );
  const jsonLdFields = Object.values(plan.fields).flatMap((field) =>
    field.sources.filter((source) => source.kind === ExtractionSourceKind.JsonLd)
  );
  const readPath = (entity: Record<string, unknown>, path: Array<string | number>): unknown =>
    path.reduce<unknown>(
      (value, part) =>
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[String(part)]
          : undefined,
      entity
    );
  const entities =
    plan.mode === ExtractionMode.Single && !plan.jsonLdType && jsonLdFields.length
      ? typedEntities.filter((entity) =>
          jsonLdFields.every(
            (source) =>
              source.kind === ExtractionSourceKind.JsonLd &&
              readPath(entity, source.path) !== undefined
          )
        )
      : typedEntities;
  if (plan.mode === ExtractionMode.Single && jsonLdFields.length && entities.length !== 1) {
    fail('A single structured-data entity must be selected unambiguously.');
  }
  let scopes: Array<cheerio.Cheerio<AnyNode> | null> = [null];
  try {
    if (!$(plan.readySelector).length) {
      report.quality = ExtractionQuality.Inconclusive;
      report.issues.push('Readiness evidence is missing.');
    }
    if (plan.mode === ExtractionMode.Collection)
      scopes = plan.containerSelector
        ? $(plan.containerSelector)
            .toArray()
            .map((node) => $(node))
        : entities.map(() => null);
    const items = scopes.map((scope, index) => {
      const record: ExtractedRecord = {};
      for (const [name, field] of Object.entries(plan.fields)) {
        let value: ExtractedRecord[string] = null;
        for (let sourceIndex = 0; sourceIndex < field.sources.length; sourceIndex++) {
          const source = field.sources[sourceIndex]!;
          let raw: unknown;
          if (source.kind === ExtractionSourceKind.JsonLd) {
            // Never associate unrelated global JSON-LD entities with DOM list positions.
            raw = scope ? undefined : entities[plan.mode === ExtractionMode.Single ? 0 : index];
            for (const part of source.path)
              raw =
                raw && typeof raw === 'object'
                  ? (raw as Record<string, unknown>)[String(part)]
                  : undefined;
          } else {
            const target = scope
              ? source.selector === ':scope'
                ? scope
                : scope.find(source.selector).first()
              : $(source.selector).first();
            raw =
              source.attribute === DOM_TEXT_ATTRIBUTE
                ? target.text()
                : target.attr(source.attribute);
          }
          value = convertFieldValue(raw, field, url);
          if (value !== null) {
            report.sourcesUsed[name] = sourceIndex;
            break;
          }
        }
        record[name] = value;
        if (value === null && field.required)
          fail(`Required field '${name}' is missing or invalid in record ${index + 1}.`);
      }
      return record;
    });
    if (plan.mode === ExtractionMode.Collection) {
      const seen = new Set<string>();
      for (const record of items) {
        const key = recordIdentity(record, plan.identityFields);
        if (seen.has(key)) fail('Duplicate collection identity.');
        seen.add(key);
      }
      items.sort((a, b) =>
        recordIdentity(a, plan.identityFields).localeCompare(recordIdentity(b, plan.identityFields))
      );
      if (!items.length && report.quality === ExtractionQuality.Complete) {
        report.quality =
          plan.emptySelector && $(plan.emptySelector).length
            ? ExtractionQuality.Empty
            : ExtractionQuality.Inconclusive;
        if (report.quality === ExtractionQuality.Inconclusive)
          report.issues.push('No records found without explicit empty-state evidence.');
      }
    }
    const ended = !plan.pagination || $(plan.pagination.endSelector).length > 0;
    const href = plan.pagination?.nextSelector
      ? $(plan.pagination.nextSelector).first().attr('href')
      : undefined;
    return {
      data:
        plan.mode === ExtractionMode.Collection ? { items, count: items.length } : (items[0] ?? {}),
      report,
      ended,
      nextUrl: href ? new URL(href, url).href : undefined,
    };
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Invalid extraction selector.');
    return { data: {}, report, ended: false };
  }
}

/** Align collection records by identity before diffing; never compare list positions. */
export function comparisonPayload(payload: ExtractedPayload, identityFields: string[]): unknown {
  if (!('items' in payload) || !Array.isArray(payload.items)) return payload;
  return {
    records: Object.fromEntries(
      payload.items.map((record) => [recordIdentity(record, identityFields), record])
    ),
  };
}
