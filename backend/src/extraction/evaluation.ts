import { isAcceptedExtractionQuality } from './constants.js';
import type { DocumentSnapshot, ExtractionPlan, Scalar } from './contracts.js';
import type { IPageExtractor } from './pageExtractor.js';
import { evaluationWouldAlert } from './evaluationAlerts.js';
import { canonicalJson } from '../utils/diffHasher.js';

export interface EvaluationCase {
  name: string;
  snapshot: DocumentSnapshot;
  plan: ExtractionPlan;
  expectedRecords: Record<string, Scalar>[];
  expectedQuality: import('./contracts.js').PageExtraction['quality'];
  previousRecords?: Record<string, Scalar>[];
  expectChange?: boolean;
}

export function evaluateCorpus(cases: EvaluationCase[], extractor: IPageExtractor) {
  const started = Date.now();
  let correctFields = 0,
    totalFields = 0,
    exactEntities = 0,
    correctQuality = 0,
    falseAlerts = 0,
    falseComplete = 0,
    missedAlerts = 0;
  const results = cases.map((item) => {
    const extracted = extractor.extract(item.snapshot, item.plan);
    const qualityCorrect = extracted.quality === item.expectedQuality;
    const entityCorrect = canonicalJson(extracted.records) === canonicalJson(item.expectedRecords);
    correctQuality += Number(qualityCorrect);
    exactEntities += Number(entityCorrect);
    item.expectedRecords.forEach((record, index) => {
      for (const [key, value] of Object.entries(record)) {
        totalFields++;
        correctFields += Number(extracted.records[index]?.[key] === value);
      }
    });
    const wouldAlert =
      isAcceptedExtractionQuality(extracted.quality) &&
      evaluationWouldAlert({
        name: item.name,
        url: item.snapshot.url,
        prompt: item.plan.intent.entity,
        plan: item.plan,
        currentRecords: extracted.records,
        previousRecords: item.previousRecords,
      });
    if (wouldAlert && item.expectChange === false) falseAlerts++;
    if (!wouldAlert && item.expectChange === true) missedAlerts++;
    if (
      isAcceptedExtractionQuality(extracted.quality) &&
      !isAcceptedExtractionQuality(item.expectedQuality)
    )
      falseComplete++;
    return {
      name: item.name,
      passed:
        entityCorrect &&
        qualityCorrect &&
        (item.expectChange === undefined || wouldAlert === item.expectChange),
      quality: extracted.quality,
    };
  });
  return {
    cases: cases.length,
    fieldAccuracy: totalFields ? correctFields / totalFields : 1,
    entityAccuracy: cases.length ? exactEntities / cases.length : 1,
    qualityAccuracy: cases.length ? correctQuality / cases.length : 1,
    falseAlerts,
    falseComplete,
    missedAlerts,
    durationMs: Date.now() - started,
    modelCalls: 0,
    results,
  };
}
