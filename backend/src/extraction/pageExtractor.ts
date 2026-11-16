import { ExtractionFailureReason, ExtractionMode, ExtractionQuality } from './constants.js';
import type { DocumentSnapshot, ExtractionPlan, PageExtraction, Scalar } from './contracts.js';
import type { SourceReaders } from './sources.js';
import {
  buildHttpErrorExtraction,
  createInitialExtraction,
  evaluateReadinessAndQuality,
  extractNextPageUrl,
  extractSingleContextRecord,
  getOrderedDefinitions,
  resolveAssociations,
  validateCollectionIntegrity,
  validateCollectionModeRecord,
  validateSingleModeRecord,
} from './pageExtractorHelpers.js';

export interface IPageExtractor {
  extract(
    snapshot: DocumentSnapshot,
    plan: ExtractionPlan,
    observed?: Map<string, boolean>
  ): PageExtraction;
}

export class PageExtractor implements IPageExtractor {
  constructor(private readonly readers: SourceReaders) {}

  extract(
    snapshot: DocumentSnapshot,
    plan: ExtractionPlan,
    observed?: Map<string, boolean>
  ): PageExtraction {
    if (snapshot.httpStatus >= 400) {
      return buildHttpErrorExtraction(snapshot.httpStatus);
    }

    const { intent, strategy } = plan;
    const result = createInitialExtraction();

    const fail = (message: string, reason: PageExtraction['failureReason'] = 'REQUIRED_FIELD') => {
      result.failureReason = reason;
      result.quality = ExtractionQuality.Invalid;
      if (!result.issues.includes(message)) result.issues.push(message);
    };

    try {
      const contexts = this.readers[strategy.records.kind].select(snapshot, strategy.records);
      if (intent.mode === ExtractionMode.Single && contexts.length !== 1) {
        fail(
          'A single entity must be selected unambiguously.',
          contexts.length
            ? ExtractionFailureReason.AmbiguousSelection
            : ExtractionFailureReason.MissingRecords
        );
      }

      const associations = resolveAssociations(strategy, this.readers, snapshot);
      const definitions = getOrderedDefinitions(intent, strategy);
      const candidates: Record<string, Scalar>[] = [];

      for (const context of contexts) {
        const output = extractSingleContextRecord({
          context,
          definitions,
          strategy,
          intent,
          associations,
          readers: this.readers,
          snapshot,
          resultSourcesUsed: result.sourcesUsed,
          onFail: fail,
        });

        candidates.push(output.record);

        if (intent.mode === ExtractionMode.Single) {
          validateSingleModeRecord({
            output,
            intent,
            strategy,
            definitions,
            result,
            onFail: fail,
          });
        } else {
          validateCollectionModeRecord({
            output,
            intent,
            strategy,
            definitions,
            result,
          });
        }
      }

      if (intent.mode === ExtractionMode.Collection) {
        validateCollectionIntegrity({
          strategy,
          intent,
          result,
          contextsLength: contexts.length,
          onFail: fail,
        });
      }

      evaluateReadinessAndQuality({
        strategy,
        snapshot,
        candidates,
        observed,
        result,
        contextsLength: contexts.length,
      });

      result.nextUrl = extractNextPageUrl(snapshot, strategy.pagination);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Page extraction failed.', 'INTERNAL');
    }

    return result;
  }
}
