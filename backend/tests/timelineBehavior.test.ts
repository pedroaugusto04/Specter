import { extractionPlanSchema } from '../src/types/extractionPlan.js';
import { fixturePlan } from './helpers/extractionFixtures.js';
import { describe, expect, it } from 'vitest';
import { FieldType, RunStatus, ChangeStatus, Coverage, type JobRunDto } from '@specter/contracts';
import {
  fieldObservations,
  numericScale,
  axisLabels,
  compressNumericObservations,
} from '../../frontend/src/lib/chartUtils.js';
import { collectionEvents } from '../../frontend/src/lib/collectionHistory.js';
import { evaluateSingleRule } from '../src/utils/triggerEvaluator.js';
import { TriggerOperator } from '../src/types/enums.js';
import { convertFieldValue } from '../src/extraction/values.js';
function reading(
  id: string,
  value: string | number | boolean | null,
  overrides: Partial<JobRunDto> = {}
): JobRunDto {
  return {
    id,
    jobId: 'job',
    contractRevision: 'revision',
    executedAt: `2026-11-05T${id.padStart(2, '0')}:00:00Z`,
    extractedData: { value },
    status: RunStatus.Success,
    hasChanges: ChangeStatus.Unchanged,
    durationMs: 0,
    httpStatus: 200,
    screenshotUrl: null,
    errorMessage: null,
    ...overrides,
  };
}
describe('Typed observations and comparisons', () => {
  it('rejects alert configurations whose operators or thresholds contradict field types', () => {
    const plan = fixturePlan({
      fields: { value: { type: FieldType.String, sources: [{ kind: 'dom', selector: 'span' }] } },
      triggerRules: [{ field: 'value', operator: TriggerOperator.LessThan, value: 10 }],
    });
    expect(extractionPlanSchema.safeParse(plan).success).toBe(false);
    plan.intent.fields.value!.type = FieldType.Number;
    plan.intent.fields.value!.locale = 'en-US';
    expect(extractionPlanSchema.safeParse(plan).success).toBe(true);
    plan.intent.triggerRules[0]!.value = '10';
    expect(extractionPlanSchema.safeParse(plan).success).toBe(false);
  });

  it('never treats text containing digits as a measurement or trigger operand', () => {
    expect(
      fieldObservations([reading('1', 'Version 2')], 'value', FieldType.Number, 'revision')[0]!.value
    ).toBeNull();
    expect(
      evaluateSingleRule('Version 2', {
        field: 'value',
        operator: TriggerOperator.GreaterThan,
        value: 1,
      }).satisfied
    ).toBe(false);
    expect(
      evaluateSingleRule('available', {
        field: 'value',
        operator: TriggerOperator.Equal,
        value: true,
      }).satisfied
    ).toBe(false);
    expect(
      evaluateSingleRule('1', { field: 'value', operator: TriggerOperator.NotEqual, value: 1 })
        .satisfied
    ).toBe(false);
  });
  it('normalizes supported formats once and rejects arbitrary surrounding text', () => {
    const field = { type: FieldType.Number, locale: 'pt-BR', description: 'price', required: true };
    for (const input of ['Versão 2', 'até 10', '10 a 20', 'R$ 10 USD', '1,250.50'])
      expect(convertFieldValue(input, field, 'https://example.com')).toBeNull();
    expect(convertFieldValue('R$ 1.250,50', field, 'https://example.com')).toBe(1250.5);
    expect(convertFieldValue('25%', field, 'https://example.com')).toBe(25);
  });
  it('compares a field against its previous valid reading, in real chronological order', () => {
    const result = fieldObservations(
      [
        reading('4', 101),
        reading('2', null),
        reading('3', 900, { contractRevision: 'other' }),
        reading('1', 100),
      ],
      'value',
      FieldType.Number,
      'revision'
    );
    expect(result.map((p) => p.value)).toEqual([100, null, null, 101]);
    expect(result[3]!.delta).toBe(1);
    expect(result[3]!.percent).toBe(1);
    expect(result[3]!.changed).toBe(true);
    expect(result[3]!.previous?.run.id).toBe('1');
    expect(result[3]!.timestamp - result[0]!.timestamp).toBe(3 * 60 * 60 * 1000);
  });

  it('maps lightweight timeseries points directly via their scalar values projection', () => {
    const points = [
      {
        id: 'p1',
        executedAt: '2026-11-05T01:00:00Z',
        status: RunStatus.Success,
        hasChanges: ChangeStatus.Initial,
        durationMs: 120,
        contractRevision: 'revision',
        errorMessage: null,
        values: { value: 50 },
      },
      {
        id: 'p2',
        executedAt: '2026-11-05T02:00:00Z',
        status: RunStatus.Success,
        hasChanges: ChangeStatus.Changed,
        durationMs: 110,
        contractRevision: 'revision',
        errorMessage: null,
        values: { value: 75 },
      },
    ];

    const result = fieldObservations(points, 'value', FieldType.Number, 'revision');
    expect(result.map((p) => p.value)).toEqual([50, 75]);
    expect(result[1]!.delta).toBe(25);
    expect(result[1]!.percent).toBe(50);
    expect(result[1]!.changed).toBe(true);
    expect(result[1]!.previous?.run.id).toBe('p1');
  });
  it('does not fabricate readings from failures or invalid dates, or percentages from zero', () => {
    const result = fieldObservations(
      [
        reading('1', 0),
        reading('2', 10, { status: RunStatus.Failed }),
        reading('3', 10, { executedAt: 'invalid' }),
        reading('4', 20),
      ],
      'value',
      FieldType.Number,
      'revision'
    );
    expect(result.filter((p) => p.value !== null).map((p) => p.value)).toEqual([0, 20]);
    expect(result.find((p) => p.run.id === '4')?.percent).toBeNull();
  });
  it.each([
    [0],
    [100, 101],
    [-10, -2],
    [0.000001, 0.000002],
    [1e12, 1e12 + 1],
    [-Number.MAX_VALUE, Number.MAX_VALUE],
  ])('keeps observations inside a finite readable scale: %j', (...values) => {
    const scale = numericScale(values);
    expect(Number.isFinite(scale.min) && Number.isFinite(scale.max)).toBe(true);
    expect(scale.min).toBeLessThan(scale.max);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(scale.min);
      expect(value).toBeLessThanOrEqual(scale.max);
    }
    const labels = axisLabels(scale.ticks);
    expect(new Set(labels).size).toBe(labels.length);
    const zeroScale = numericScale(values, true);
    expect(zeroScale.min).toBeLessThanOrEqual(0);
    expect(zeroScale.max).toBeGreaterThanOrEqual(0);
  });
  it('does not infer collection removals from incomplete coverage or item ordering', () => {
    const complete = (
      id: string,
      items: { id: string; value: number }[],
      coverage = Coverage.Complete
    ) =>
      reading(id, null, {
        extractedData: { items, count: items.length },
        extractionReport: { quality: 'COMPLETE', coverage },
      });
    const events = collectionEvents(
      [
        complete('1', [
          { id: 'a', value: 1 },
          { id: 'b', value: 2 },
        ]),
        complete('2', [
          { id: 'b', value: 2 },
          { id: 'a', value: 1 },
        ]),
        {
          ...complete('3', []),
          extractionReport: { quality: 'PARTIAL', coverage: Coverage.Partial },
        },
        complete('4', [{ id: 'a', value: 3 }]),
      ],
      'revision',
      ['id']
    );
    expect(events[1]!.changes).toEqual([]);
    expect(events[2]!.reliable).toBe(false);
    expect(events[2]!.changes).toEqual([]);
    expect(events[3]!.changes).toHaveLength(2);
  });

  it('compresses consecutive plateau readings preserving boundary transition points', () => {
    const rawRuns = [
      reading('01', 100),
      reading('02', 100),
      reading('03', 100),
      reading('04', 100),
      reading('05', 120),
      reading('06', 120),
      reading('07', 120),
      reading('08', 110),
    ];
    const obs = fieldObservations(rawRuns, 'value', FieldType.Number, 'revision');
    const compressed = compressNumericObservations(obs);

    // Initial 100, last 100 before transition, first 120, last 120 before transition, 110
    expect(compressed.map((p) => p.run.id)).toEqual(['01', '04', '05', '07', '08']);
    expect(compressed.map((p) => p.value)).toEqual([100, 100, 120, 120, 110]);
  });
});
