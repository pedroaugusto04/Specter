import crypto from 'node:crypto';
import { EntityChangeKind } from '@specter/contracts';
import type { DiffChangeEntry, DiffSummary } from '../types/domain.js';

/**
 * Patterns for volatile strings that should not trigger false-positive diff alerts:
 * - Relative timestamps in English ("posted 2 minutes ago", "updated 3 hours ago", "just now", "5 mins ago")
 * - Relative timestamps in Portuguese ("postado há 2 minutos", "há 5 horas", "atualizado agora há pouco")
 * - Volatile query tokens/session IDs in URLs (utm_*, session_id, sid, _t, timestamp)
 */
const RELATIVE_TIME_PATTERNS: RegExp[] = [
  /\b(?:posted|updated|published|modified|seen|active|edited)?\s*(?:about\s+|aproximadamente\s+)?\d+\s*(?:seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|years?)\s+ago\b/gi,
  /\b(?:postado|atualizado|publicado|visto|modificado)?\s*h[aá]\s+(?:cerca\s+de\s+)?\d+\s*(?:segundos?|segs?|minutos?|mins?|horas?|dias?|semanas?|meses|anos?)\b/gi,
  /\b(?:just\s+now|right\s+now|moments?\s+ago|agora\s+mesmo|h[aá]\s+poucos?\s+instantes?)\b/gi,
];

const VOLATILE_QUERY_PARAM_PATTERN =
  /([?&])(?:utm_[a-z_]+|session_?id|sid|phpsessid|jsessionid|__cf_chl_[a-z0-9_]*|_t|timestamp|cb|cachebuster)=[^&#\s]*/gi;

export function sanitizeVolatileString(input: string): string {
  let cleaned = input;

  for (const pattern of RELATIVE_TIME_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  cleaned = cleaned.replace(VOLATILE_QUERY_PARAM_PATTERN, '$1');
  cleaned = cleaned.replace(/[?&]+(?=#|$|\s)/g, '');
  cleaned = cleaned.replace(/\?&/g, '?');

  return cleaned.replace(/\s+/g, ' ').trim();
}

/** Canonical JSON for structural comparison; preserves array order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

export function sortObjectKeys(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}

function flattenPayload(
  data: unknown,
  prefix = '',
  target: Record<string, unknown> = {}
): Record<string, unknown> {
  if (data === null || data === undefined || typeof data !== 'object') {
    if (prefix) {
      target[prefix] = data;
    }
    return target;
  }

  if (Array.isArray(data)) {
    if (data.length === 0 && prefix) {
      target[prefix] = [];
      return target;
    }
    data.forEach((item, index) => {
      const pathKey = prefix ? `${prefix}[${index}]` : `[${index}]`;
      flattenPayload(item, pathKey, target);
    });
    return target;
  }

  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0 && prefix) {
    target[prefix] = {};
    return target;
  }

  for (const [key, val] of entries) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === 'object') {
      flattenPayload(val, pathKey, target);
    } else {
      target[pathKey] = val;
    }
  }

  return target;
}

function renderDiffSummaryText(changes: DiffChangeEntry[]): string {
  if (changes.length === 0) {
    return 'No significant changes detected across monitored fields.';
  }

  const lines: string[] = [];
  for (const change of changes) {
    if (change.changeType === EntityChangeKind.Modified) {
      lines.push(
        `• [Modified] ${change.field}: "${change.previousValue}" → "${change.currentValue}"`
      );
    } else if (change.changeType === EntityChangeKind.Added) {
      lines.push(`• [Added] ${change.field}: "${change.currentValue}"`);
    } else {
      lines.push(`• [Removed] ${change.field}: (previously "${change.previousValue}")`);
    }
  }

  return lines.join('\n');
}

/**
 * Builds a structured and text-formatted diff summary between two payloads.
 */
export function buildDiffSummary(previousData: unknown, currentData: unknown): DiffSummary {
  const flatPrev = flattenPayload(sortObjectKeys(previousData));
  const flatCurr = flattenPayload(sortObjectKeys(currentData));

  const allKeys = Array.from(new Set([...Object.keys(flatPrev), ...Object.keys(flatCurr)])).sort();

  const added: DiffChangeEntry[] = [];
  const modified: DiffChangeEntry[] = [];
  const removed: DiffChangeEntry[] = [];

  for (const key of allKeys) {
    const hasPrev = Object.prototype.hasOwnProperty.call(flatPrev, key) && flatPrev[key] !== null;
    const hasCurr = Object.prototype.hasOwnProperty.call(flatCurr, key) && flatCurr[key] !== null;

    if (!hasPrev && hasCurr) {
      added.push({
        field: key,
        changeType: EntityChangeKind.Added,
        previousValue: null,
        currentValue: flatCurr[key],
      });
    } else if (hasPrev && !hasCurr) {
      removed.push({
        field: key,
        changeType: EntityChangeKind.Removed,
        previousValue: flatPrev[key],
        currentValue: null,
      });
    } else if (
      hasPrev &&
      hasCurr &&
      JSON.stringify(flatPrev[key]) !== JSON.stringify(flatCurr[key])
    ) {
      modified.push({
        field: key,
        changeType: EntityChangeKind.Modified,
        previousValue: flatPrev[key],
        currentValue: flatCurr[key],
      });
    }
  }

  const allChanges = [...modified, ...added, ...removed];

  return {
    hasChanges: allChanges.length > 0,
    totalChanges: allChanges.length,
    added,
    modified,
    removed,
    summaryText: renderDiffSummaryText(allChanges),
  };
}

/** Hash validated fields without silently deleting requested data. */
export function computeExtractionHash(payload: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');
}
