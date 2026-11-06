import crypto from 'crypto';
import type { DiffChangeEntry, DiffSummary } from '../types/domain.js';

/**
 * Patterns for volatile strings that should not trigger false-positive diff alerts:
 * - Relative timestamps in English ("posted 2 minutes ago", "updated 3 hours ago", "just now", "5 mins ago")
 * - Relative timestamps in Portuguese ("postado há 2 minutos", "há 5 horas", "atualizado agora há pouco")
 * - SEO/meta page branding suffixes (e.g. " | Americanas", " | Mercado Livre")
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

  // Strip volatile query params from URLs while preserving clean URL structure
  cleaned = cleaned.replace(VOLATILE_QUERY_PARAM_PATTERN, '$1');
  cleaned = cleaned.replace(/[?&]+(?=#|$|\s)/g, '');
  cleaned = cleaned.replace(/\?&/g, '?');

  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Recursively sorts object keys without altering string values.
 */
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

function escapeHtml(value: unknown): string {
  const str = value === null || value === undefined ? '—' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds a human-readable and HTML-formatted diff summary between two payloads.
 */
export function buildDiffSummary(previousData: unknown, currentData: unknown): DiffSummary {
  const normalizedPrev = sortObjectKeys(previousData);
  const normalizedCurr = sortObjectKeys(currentData);

  const flatPrev = flattenPayload(normalizedPrev);
  const flatCurr = flattenPayload(normalizedCurr);

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
        changeType: 'ADDED',
        previousValue: null,
        currentValue: flatCurr[key],
      });
    } else if (hasPrev && !hasCurr) {
      removed.push({
        field: key,
        changeType: 'REMOVED',
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
        changeType: 'MODIFIED',
        previousValue: flatPrev[key],
        currentValue: flatCurr[key],
      });
    }
  }

  const allChanges = [...modified, ...added, ...removed];
  const hasChanges = allChanges.length > 0;

  const lines: string[] = [];
  for (const change of allChanges) {
    if (change.changeType === 'MODIFIED') {
      lines.push(
        `• [Modified] ${change.field}: "${change.previousValue}" → "${change.currentValue}"`
      );
    } else if (change.changeType === 'ADDED') {
      lines.push(`• [Added] ${change.field}: "${change.currentValue}"`);
    } else {
      lines.push(`• [Removed] ${change.field}: (previously "${change.previousValue}")`);
    }
  }

  const summaryText = hasChanges
    ? lines.join('\n')
    : 'No significant changes detected across monitored fields.';

  const rowsHtml = allChanges
    .map((change) => {
      const badgeColor =
        change.changeType === 'MODIFIED'
          ? '#d97706'
          : change.changeType === 'ADDED'
            ? '#16a34a'
            : '#dc2626';
      const badgeLabel =
        change.changeType === 'MODIFIED'
          ? 'Modified'
          : change.changeType === 'ADDED'
            ? 'New'
            : 'Removed';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:13px;">${escapeHtml(change.field)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;"><span style="background:${badgeColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${badgeLabel}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${escapeHtml(change.previousValue)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:600;font-size:13px;">${escapeHtml(change.currentValue)}</td>
      </tr>`;
    })
    .join('');

  const summaryHtml = hasChanges
    ? `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;text-align:left;font-size:12px;color:#374151;">
            <th style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Field</th>
            <th style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Status</th>
            <th style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Previous Value</th>
            <th style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">New Value</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`
    : '<p style="color:#6b7280;">No significant changes detected.</p>';

  return {
    hasChanges,
    totalChanges: allChanges.length,
    added,
    modified,
    removed,
    summaryText,
    summaryHtml,
  };
}

/** Hash validated fields without silently deleting requested data. */
export function computeExtractionHash(payload: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');
}
