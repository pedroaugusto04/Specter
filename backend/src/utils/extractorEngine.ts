import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type {
  ExtractedPayload,
  ExtractedRecord,
  ExtractorConfig,
  ExtractorFieldDefinition,
  FieldExtractor,
} from '../types/extractor.js';

export function normalizeFieldDefinition(def: ExtractorFieldDefinition): Required<FieldExtractor> {
  if (typeof def === 'string') {
    return {
      selector: def,
      fallbackSelectors: [],
      attribute: 'text',
      type: 'string',
    };
  }
  return {
    selector: def.selector,
    fallbackSelectors: Array.isArray(def.fallbackSelectors) ? def.fallbackSelectors : [],
    attribute: def.attribute ?? 'text',
    type: def.type ?? 'string',
  };
}

function coerceValue(
  rawValue: string | null,
  targetType: 'string' | 'number' | 'boolean'
): string | number | boolean | null {
  if (rawValue === null) {
    return null;
  }

  const trimmed = rawValue.replace(/\s+/g, ' ').trim();
  if (trimmed === '') {
    return null;
  }

  if (targetType === 'number') {
    // Support formats like "R$ 1.299,90" or "$1,299.90"
    const cleaned = trimmed.replace(/[^\d,.-]/g, '');
    if (!cleaned) return null;

    let normalizedNumberStr = cleaned;
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    if (lastComma > lastDot) {
      normalizedNumberStr = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
      normalizedNumberStr = cleaned.replace(/,/g, '');
    }

    const parsed = Number(normalizedNumberStr);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (targetType === 'boolean') {
    const lower = trimmed.toLowerCase();
    if (['true', '1', 'yes', 'sim', 'ativo', 'in stock', 'disponível'].includes(lower)) {
      return true;
    }
    if (['false', '0', 'no', 'não', 'inativo', 'out of stock', 'indisponível'].includes(lower)) {
      return false;
    }
    return Boolean(trimmed);
  }

  return trimmed;
}

function tryExtractSelector(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<AnyNode> | null,
  selector: string,
  attribute: string,
  type: 'string' | 'number' | 'boolean'
): string | number | boolean | null {
  if (!selector || !selector.trim()) {
    return null;
  }

  let target: cheerio.Cheerio<AnyNode>;
  try {
    if (scope) {
      target = selector === ':scope' || selector === '.' ? scope : scope.find(selector).first();
      if (target.length === 0 && scope.is(selector)) {
        target = scope;
      }
    } else {
      target = $(selector).first();
    }
  } catch {
    // In case an invalid or unsupported selector was passed
    return null;
  }

  if (target.length === 0) {
    return null;
  }

  let raw: string | null = null;
  if (!attribute || attribute === 'text') {
    raw = target.text();
  } else {
    raw = target.attr(attribute) ?? null;
  }

  return coerceValue(raw, type);
}

function extractSingleValue(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<AnyNode> | null,
  fieldDef: Required<FieldExtractor>
): string | number | boolean | null {
  const { selector, fallbackSelectors, attribute, type } = fieldDef;

  // 1. Try primary selector
  const primaryResult = tryExtractSelector($, scope, selector, attribute, type);
  if (primaryResult !== null) {
    return primaryResult;
  }

  // 2. Cascade through fallbackSelectors in priority order
  for (const fallback of fallbackSelectors) {
    const fallbackResult = tryExtractSelector($, scope, fallback, attribute, type);
    if (fallbackResult !== null) {
      return fallbackResult;
    }
  }

  return null;
}

function isRecordNonEmpty(record: ExtractedRecord): boolean {
  return Object.values(record).some((val) => val !== null && val !== '');
}

/**
 * Deterministic extraction using Cheerio and a compiled ExtractorConfig.
 * Supports both single-entity pages and multi-item container lists (`containerSelector`).
 */
export function extractUsingConfig(
  htmlOrCheerio: string | cheerio.CheerioAPI,
  config: ExtractorConfig
): ExtractedPayload {
  const $ = typeof htmlOrCheerio === 'string' ? cheerio.load(htmlOrCheerio) : htmlOrCheerio;
  const fieldEntries = Object.entries(config.fields ?? {});

  if (fieldEntries.length === 0) {
    return {};
  }

  if (config.containerSelector && config.containerSelector.trim() !== '') {
    const containers = $(config.containerSelector);
    if (containers.length === 0) {
      return {};
    }

    const items: ExtractedRecord[] = [];
    containers.each((_, el) => {
      const scope = $(el);
      const itemRecord: ExtractedRecord = {};
      for (const [fieldName, rawDef] of fieldEntries) {
        const normalizedDef = normalizeFieldDefinition(rawDef);
        itemRecord[fieldName] = extractSingleValue($, scope, normalizedDef);
      }
      if (isRecordNonEmpty(itemRecord)) {
        items.push(itemRecord);
      }
    });

    if (items.length === 0) {
      return {};
    }

    return {
      items,
      count: items.length,
    };
  }

  const record: ExtractedRecord = {};
  for (const [fieldName, rawDef] of fieldEntries) {
    const normalizedDef = normalizeFieldDefinition(rawDef);
    record[fieldName] = extractSingleValue($, null, normalizedDef);
  }

  if (!isRecordNonEmpty(record)) {
    return {};
  }

  return record;
}

export function isExtractedPayloadEmpty(payload: ExtractedPayload | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') {
    return true;
  }

  if ('items' in payload && Array.isArray(payload.items)) {
    return payload.items.length === 0;
  }

  const values = Object.values(payload);
  if (values.length === 0) {
    return true;
  }

  return !values.some((v) => v !== null && v !== undefined && v !== '');
}

function isDisallowedHeadSelector(selector: string): boolean {
  const s = selector.trim().toLowerCase();
  return (
    s === 'title' ||
    s.startsWith('title#') ||
    s.startsWith('title.') ||
    s.startsWith('title[') ||
    s.startsWith('head ') ||
    s.startsWith('head >') ||
    s === 'head'
  );
}

/**
 * Runs a pre-activation smoke test of the compiled ExtractorConfig against the sanitized DOM.
 */
export function validateExtractionSmokeTest(
  sanitizedHtml: string,
  config: ExtractorConfig
): { valid: boolean; extractedData: ExtractedPayload; reason?: string } {
  if (!config || typeof config !== 'object' || !config.fields || Object.keys(config.fields).length === 0) {
    return {
      valid: false,
      extractedData: {},
      reason: 'Extractor config has no fields defined.',
    };
  }

  // Guardrail: reject extractors where all field selectors target the <title> or <head> tag
  const fieldDefs = Object.values(config.fields);
  const allTargetHead =
    fieldDefs.length > 0 &&
    fieldDefs.every((def) => {
      const norm = normalizeFieldDefinition(def);
      return (
        isDisallowedHeadSelector(norm.selector) &&
        norm.fallbackSelectors.every((fb) => isDisallowedHeadSelector(fb))
      );
    });

  if (allTargetHead) {
    return {
      valid: false,
      extractedData: {},
      reason:
        'Smoke test failed: selectors target document <title> or <head> metadata instead of visible <body> content.',
    };
  }

  try {
    const extractedData = extractUsingConfig(sanitizedHtml, config);
    if (isExtractedPayloadEmpty(extractedData)) {
      return {
        valid: false,
        extractedData: {},
        reason: 'Smoke test extracted no non-empty values from the sanitized DOM.',
      };
    }

    return {
      valid: true,
      extractedData,
    };
  } catch (error) {
    return {
      valid: false,
      extractedData: {},
      reason: error instanceof Error ? error.message : 'Invalid CSS selector in extractor config.',
    };
  }
}
