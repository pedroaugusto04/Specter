import { ExtractionMode, isAcceptedExtractionQuality } from './constants.js';
import type { DocumentSnapshot, ExtractionPlan, Scalar } from './contracts.js';
import type { IPageExtractor } from './pageExtractor.js';
import { buildChangeAlert } from '../utils/changeAlertHelper.js';
import type { ExtractedPayload } from '../types/extractor.js';
import { computeExtractionHash, sortObjectKeys } from '../utils/diffHasher.js';

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
    const payload = (records: Record<string, Scalar>[]): ExtractedPayload =>
      item.plan.intent.mode === ExtractionMode.Single
        ? (records[0] ?? {})
        : { items: records, count: records.length };
    const current = payload(extracted.records);
    const previous = item.previousRecords ? payload(item.previousRecords) : undefined;
    const wouldAlert =
      previous !== undefined &&
      isAcceptedExtractionQuality(extracted.quality) &&
      computeExtractionHash(previous) !== computeExtractionHash(current) &&
      Boolean(
        buildChangeAlert({
          job: {
            id: item.name,
            userId: 'corpus',
            name: item.name,
            url: item.snapshot.url,
            userPrompt: item.plan.intent.entity,
            notificationEmail: '',
            extractionPlan: item.plan,
          },
          currentData: current,
          previousData: previous,
          triggerRules: item.plan.intent.triggerRules,
          triggerMatchMode: item.plan.intent.triggerMatchMode,
        })
      );
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
