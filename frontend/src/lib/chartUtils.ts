import {
  isCollectionPayload,
  ChangeStatus,
  FieldType,
  RunStatus,
  type JobRunDto,
  type IntentField,
} from '@specter/contracts';

export const SCALE_MODE = { Adjusted: 'adjusted', Zero: 'zero' } as const;
export const TEXT_MODE = { Events: 'events', States: 'states' } as const;
export type TimelineFields = Record<string, Pick<IntentField, 'type' | 'displayName' | 'locale'>>;
export interface Observation {
  run: JobRunDto;
  timestamp: number;
  value: string | number | boolean | null;
  previous: Observation | null;
  changed: boolean;
  delta: number | null;
  percent: number | null;
}
export function orderedRuns(runs: JobRunDto[]): JobRunDto[] {
  return [...runs].sort(
    (a, b) => Date.parse(a.executedAt) - Date.parse(b.executedAt) || a.id.localeCompare(b.id)
  );
}
function matchesFieldType(val: unknown, type: IntentField['type']): boolean {
  if (type === FieldType.Number) return typeof val === 'number' && Number.isFinite(val);
  if (type === FieldType.Boolean) return typeof val === 'boolean';
  return typeof val === 'string';
}

export function fieldObservations(
  runs: JobRunDto[],
  field: string,
  type: IntentField['type'],
  revision: string | null
): Observation[] {
  let previous: Observation | null = null;
  return orderedRuns(runs).map((run) => {
    const timestamp = Date.parse(run.executedAt);
    const data = run.extractedData;
    const isValidRun =
      run.status === RunStatus.Success &&
      Number.isFinite(timestamp) &&
      (!revision || run.contractRevision === revision) &&
      data !== null &&
      !isCollectionPayload(data);

    const raw = isValidRun ? data[field] : null;
    const value = matchesFieldType(raw, type) ? raw! : null;

    const delta =
      typeof value === 'number' && typeof previous?.value === 'number'
        ? value - previous.value
        : null;

    const percent =
      delta !== null &&
      typeof previous?.value === 'number' &&
      previous.value !== 0 &&
      typeof value === 'number' &&
      value * previous.value >= 0
        ? (delta / Math.abs(previous.value)) * 100
        : null;

    const observation: Observation = {
      run,
      timestamp,
      value,
      previous,
      changed: value !== null && previous !== null && value !== previous.value,
      delta,
      percent,
    };
    if (value !== null) previous = observation;
    return observation;
  });
}
export function numericScale(values: number[], includeZero = false) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: -1, max: 1, ticks: [-1, 0, 1] };
  let min = Math.min(...finite),
    max = Math.max(...finite);
  const magnitude = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const spread = max / magnitude - min / magnitude;
  const margin = spread === 0 ? (min === 0 ? 1 : 0.1) : spread * 0.1;
  let low = min / magnitude - margin;
  let high = max / magnitude + margin;
  if (includeZero) {
    low = Math.min(low, 0);
    high = Math.max(high, 0);
  }
  const rawStep = (high - low) / 4;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].find((factor) => factor * power >= rawStep)! * power;
  min = Math.max(-Number.MAX_VALUE, Math.floor(low / step) * step * magnitude);
  max = Math.min(Number.MAX_VALUE, Math.ceil(high / step) * step * magnitude);
  const ticks = Array.from(
    { length: 5 },
    (_, i) => (min / magnitude + ((max / magnitude - min / magnitude) * i) / 4) * magnitude
  );
  return { min, max, ticks };
}
/** Use the shortest precision that keeps adjacent scale labels distinguishable. */
export function axisLabels(ticks: number[]): string[] {
  for (let precision = 1; precision <= 17; precision++) {
    const formatter = new Intl.NumberFormat(undefined, { maximumSignificantDigits: precision });
    const labels = ticks.map((value) => formatter.format(value));
    if (new Set(labels).size === ticks.length) return labels;
  }
  return ticks.map(String);
}

/**
 * Compresses consecutive plateau points having the same value,
 * preserving boundary points where values change.
 */
export function compressNumericObservations(points: Observation[]): Observation[] {
  if (points.length <= 2) return points;

  const compressed: Observation[] = [points[0]!];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;

    if (curr.value !== prev.value || curr.value !== next.value) {
      compressed.push(curr);
    }
  }

  compressed.push(points[points.length - 1]!);
  return compressed;
}
