import type { ExecutionContext, StageTrace } from '../extraction/contracts.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AccessFailure, AcquisitionFailureError, classifyAccessFailure } from './failure.js';
import { AcquisitionOutcome } from '../types/access.js';
import { TraceStatus } from '../extraction/constants.js';

export interface AcquisitionCandidate<T> {
  name: string;
  external: boolean;
  run(context: ExecutionContext): Promise<T>;
}
/** Shared sequential policy for documents and validated plan executions. */
export async function acquire<T>(
  candidates: AcquisitionCandidate<T>[],
  context: ExecutionContext,
  accepted: (result: T) => boolean,
  maxAttempts = env.ACQUISITION_MAX_ATTEMPTS,
  trace: StageTrace[] = []
): Promise<T> {
  let failure: AccessFailure | undefined;
  let cause: unknown;
  let rejected: T | undefined;
  for (const candidate of candidates.slice(0, maxAttempts)) {
    if (context.signal.aborted || !context.remaining()) {
      throw new AcquisitionFailureError(AccessFailure.Timeout, context.signal.reason);
    }
    const started = Date.now();
    try {
      const result = await candidate.run(context);
      context.check();
      const valid = accepted(result);
      trace.push({
        stage: 'acquisition:' + candidate.name,
        durationMs: Date.now() - started,
        status: valid ? TraceStatus.Success : TraceStatus.Failed,
        code: valid ? AcquisitionOutcome.Accepted : AcquisitionOutcome.Rejected,
      });
      if (valid || (!candidate.external && !failure)) return result;
      rejected = result;
    } catch (error) {
      const category = classifyAccessFailure(error);
      logger.warn('Acquisition candidate failed', {
        runId: context.runId,
        provider: candidate.name,
        category: category ?? AccessFailure.Provider,
        errorCode:
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : error instanceof Error
              ? error.name
              : 'UNKNOWN_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
        causeMessage:
          error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
        durationMs: Date.now() - started,
      });
      if (!category && !candidate.external) throw error;
      // A provider quota/error does not erase a confirmed target block.
      failure =
        category === AccessFailure.Blocked || failure === AccessFailure.Blocked
          ? AccessFailure.Blocked
          : (category ?? AccessFailure.Provider);
      cause = error;
      trace.push({
        stage: 'acquisition:' + candidate.name,
        durationMs: Date.now() - started,
        status: TraceStatus.Failed,
        code: category ?? AccessFailure.Provider,
      });
    } finally {
      logger.info('Acquisition attempt completed', {
        runId: context.runId,
        provider: candidate.name,
        outcome: trace.at(-1)?.code,
        durationMs: Date.now() - started,
      });
    }
  }
  // An accessible but invalid provider document is a plan result, not an access block.
  if (rejected !== undefined) return rejected;
  throw new AcquisitionFailureError(failure ?? AccessFailure.Provider, cause);
}
