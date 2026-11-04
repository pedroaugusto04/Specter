import type { DocumentSnapshot, ExtractionPlan, Scalar } from './contracts.js';
import type { IPageExtractor } from './pageExtractor.js';
import { sortObjectKeys } from '../utils/diffHasher.js';
export interface EvaluationCase {
  name: string;
  snapshot: DocumentSnapshot;
  plan: ExtractionPlan;
  expectedRecords: Record<string, Scalar>[];
  expectedQuality: string;
  previousRecords?: Record<string, Scalar>[];
  expectChange?: boolean;
}
export function evaluateCorpus(cases: EvaluationCase[], extractor: IPageExtractor) {
  const started = Date.now();
  let correctFields = 0,
    totalFields = 0,
    exactEntities = 0,
    correctQuality = 0,
    falseAlerts = 0;
  const serialize = (value: unknown) => JSON.stringify(sortObjectKeys(value));
  const results = cases.map((item) => {
    const extracted = extractor.extract(item.snapshot, item.plan);
    const qualityCorrect = extracted.quality === item.expectedQuality;
    const entityCorrect = serialize(extracted.records) === serialize(item.expectedRecords);
    correctQuality += Number(qualityCorrect);
    exactEntities += Number(entityCorrect);
    item.expectedRecords.forEach((record, index) => {
      for (const [key, value] of Object.entries(record)) {
        totalFields++;
        correctFields += Number(extracted.records[index]?.[key] === value);
      }
    });
    const wouldAlert =
      item.previousRecords !== undefined &&
      ['COMPLETE', 'EMPTY'].includes(extracted.quality) &&
      serialize(item.previousRecords) !== serialize(extracted.records);
    if (wouldAlert && item.expectChange === false) falseAlerts++;
    return {
      name: item.name,
      passed: entityCorrect && qualityCorrect && !(wouldAlert && item.expectChange === false),
      quality: extracted.quality,
    };
  });
  return {
    cases: cases.length,
    fieldAccuracy: totalFields ? correctFields / totalFields : 1,
    entityAccuracy: cases.length ? exactEntities / cases.length : 1,
    qualityAccuracy: cases.length ? correctQuality / cases.length : 1,
    falseAlerts,
    durationMs: Date.now() - started,
    modelCalls: 0,
    results,
  };
}
