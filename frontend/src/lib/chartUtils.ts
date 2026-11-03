import type { JobRunDto } from '@/lib/api';
import type { ChangeStatus, RunStatus } from './domainValues';
import { CHANGE_STATUS, RUN_STATUS } from './domainValues';
import { formatCompactDate, formatDateTime } from '@/lib/utils';

export interface NumericFieldCandidate {
  key: string;
  label: string;
  sampleValue: string | number;
  validCount: number;
}

export interface ChartDataPoint {
  runId: string;
  timestamp: number;
  formattedTime: string;
  formattedCompactTime: string;
  rawValue: unknown;
  numericValue: number | null;
  displayValue: string;
  hasChanges: ChangeStatus;
  status: RunStatus;
  durationMs: number | null;
  httpStatus: number | null;
  deltaFromPrev: number | null;
  deltaPercentFromPrev: number | null;
}

export interface RunMetricsSummary {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  changeRuns: number;
  changeRatePercent: number;
  averageDurationMs: number | null;
  lastChangeAt: string | null;
}

/**
 * Parses numeric/monetary tokens from primitive values, strings, or currencies.
 * Returns null if the value is non-numeric or purely qualitative text.
 */
export function parseNumericValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^(true|false|yes|no|active|inactive|null|undefined)$/i.test(trimmed)) {
      return null;
    }

    const match = /[-+]?[\d.,]+/.exec(trimmed);
    if (!match) return null;

    let candidate = match[0].replace(/[.,]+$/, '');
    if (!candidate || candidate === '-' || candidate === '+') return null;

    const commaIdx = candidate.lastIndexOf(',');
    const dotIdx = candidate.lastIndexOf('.');

    if (commaIdx > -1 && dotIdx > -1) {
      if (commaIdx > dotIdx) {
        // European / Brazilian format (e.g. "1.250,50")
        candidate = candidate.replace(/\./g, '').replace(',', '.');
      } else {
        // US / UK format (e.g. "1,250.50")
        candidate = candidate.replace(/,/g, '');
      }
    } else if (commaIdx > -1) {
      const afterComma = candidate.length - commaIdx - 1;
      if (afterComma === 1 || afterComma === 2) {
        candidate = candidate.replace(',', '.');
      } else if (afterComma === 3 && candidate.indexOf(',') !== candidate.lastIndexOf(',')) {
        candidate = candidate.replace(/,/g, '');
      } else if (afterComma === 3) {
        candidate = candidate.replace(',', '');
      } else {
        candidate = candidate.replace(',', '.');
      }
    } else if (dotIdx > -1) {
      if (candidate.indexOf('.') !== dotIdx) {
        candidate = candidate.replace(/\./g, '');
      }
    }

    const parsed = parseFloat(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Formats a numeric value for chart axes and metrics labels.
 */
export function formatNumericValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString('en-US');
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Scans run payloads to identify object fields containing numeric values suitable for plotting.
 */
export function detectNumericFields(runs: JobRunDto[]): NumericFieldCandidate[] {
  const counts = new Map<string, { count: number; sample: string | number }>();

  for (const run of runs) {
    if (!run.extractedData || typeof run.extractedData !== 'object') continue;
    for (const [key, rawValue] of Object.entries(run.extractedData)) {
      const parsed = parseNumericValue(rawValue);
      if (parsed !== null) {
        const existing = counts.get(key) || { count: 0, sample: '' };
        counts.set(key, {
          count: existing.count + 1,
          sample: typeof rawValue === 'string' || typeof rawValue === 'number' ? rawValue : parsed,
        });
      }
    }
  }

  return Array.from(counts.entries())
    .map(([key, data]) => ({
      key,
      label: key
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        .trim(),
      sampleValue: data.sample,
      validCount: data.count,
    }))
    .sort((a, b) => b.validCount - a.validCount);
}

/**
 * Builds chronological time-series points (ordered from oldest to newest)
 * for a specific field across runs.
 */
export function buildChartDataPoints(
  runs: JobRunDto[],
  fieldKey: string,
  timeZone: string
): ChartDataPoint[] {
  // Runs arrive newest-first from the API; reverse to display chronologically (past -> present)
  const chronological = [...runs].reverse();
  const points: ChartDataPoint[] = [];

  let previousNumeric: number | null = null;

  for (const run of chronological) {
    const rawVal =
      run.extractedData && typeof run.extractedData === 'object'
        ? (run.extractedData as Record<string, unknown>)[fieldKey]
        : null;

    const numVal = parseNumericValue(rawVal);
    let deltaFromPrev: number | null = null;
    let deltaPercentFromPrev: number | null = null;

    if (numVal !== null && previousNumeric !== null) {
      deltaFromPrev = numVal - previousNumeric;
      if (previousNumeric !== 0) {
        deltaPercentFromPrev = (deltaFromPrev / previousNumeric) * 100;
      }
    }

    if (numVal !== null) {
      previousNumeric = numVal;
    }

    const d = new Date(run.executedAt);
    const ts = Number.isNaN(d.getTime()) ? Date.now() : d.getTime();

    points.push({
      runId: run.id,
      timestamp: ts,
      formattedTime: formatDateTime(run.executedAt, timeZone),
      formattedCompactTime: formatCompactDate(run.executedAt, timeZone),
      rawValue: rawVal,
      numericValue: numVal,
      displayValue:
        rawVal !== null && rawVal !== undefined
          ? String(rawVal)
          : numVal !== null
            ? formatNumericValue(numVal)
            : '—',
      hasChanges: run.hasChanges,
      status: run.status,
      durationMs: run.durationMs,
      httpStatus: run.httpStatus,
      deltaFromPrev,
      deltaPercentFromPrev,
    });
  }

  return points;
}

/**
 * Calculates high-level aggregate metrics for the execution history.
 */
export function calculateRunMetrics(runs: JobRunDto[]): RunMetricsSummary {
  const totalRuns = runs.length;
  let successRuns = 0;
  let failedRuns = 0;
  let changeRuns = 0;
  let totalDuration = 0;
  let validDurationCount = 0;
  let lastChangeAt: string | null = null;

  for (const run of runs) {
    if (run.status === RUN_STATUS.Success) successRuns++;
    if (run.status === RUN_STATUS.Failed) failedRuns++;
    if (run.hasChanges === CHANGE_STATUS.Changed) {
      changeRuns++;
      if (!lastChangeAt) {
        // Runs are newest-first, so the first change encountered is the most recent
        lastChangeAt = run.executedAt;
      }
    }
    if (run.durationMs !== null && run.durationMs > 0) {
      totalDuration += run.durationMs;
      validDurationCount++;
    }
  }

  return {
    totalRuns,
    successRuns,
    failedRuns,
    changeRuns,
    changeRatePercent: totalRuns > 0 ? (changeRuns / totalRuns) * 100 : 0,
    averageDurationMs:
      validDurationCount > 0 ? Math.round(totalDuration / validDurationCount) : null,
    lastChangeAt,
  };
}
