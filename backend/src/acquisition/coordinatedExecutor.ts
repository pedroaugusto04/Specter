import { AcquisitionFailureError, classifyReportFailure } from './failure.js';
import type { DocumentAdapter, ExecutionPolicy, ExtractionPlan } from '../extraction/contracts.js';
import type {
  ExecutionOptions,
  ExecutionResult,
  IExtractionExecutor,
} from '../extraction/executor.js';
import { ExtractionExecutor } from '../extraction/executor.js';
import type { IPageExtractor } from '../extraction/pageExtractor.js';
import { createExecutionContext } from '../extraction/context.js';
import { requiresBrowser } from '../extraction/capabilities.js';
import { Transport, isAcceptedExtractionQuality } from '../extraction/constants.js';
import { acquire } from './runner.js';

export interface DocumentCandidate {
  name: string;
  external: boolean;
  transport: Transport;
  adapter: DocumentAdapter;
}
export class CoordinatedExecutor implements IExtractionExecutor {
  constructor(
    private readonly candidates: DocumentCandidate[],
    private readonly extractor: IPageExtractor,
    private readonly policy: ExecutionPolicy
  ) {}
  async execute(
    url: string,
    plan: ExtractionPlan,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const context = createExecutionContext(
      Math.min(options.timeoutMs ?? this.policy.timeoutMs, this.policy.timeoutMs),
      options.signal
    );
    const trace: NonNullable<ExecutionResult['report']['trace']> = [];
    const compatible = this.candidates.filter((candidate) =>
      plan.strategy.transport === Transport.Http
        ? candidate.transport === Transport.Http
        : candidate.transport === Transport.Browser || !requiresBrowser(plan.strategy)
    );
    const result = await acquire(
      compatible.map((candidate) => ({
        ...candidate,
        run: async () => {
          const execution = await new ExtractionExecutor(
            { http: candidate.adapter, browser: candidate.adapter },
            this.extractor,
            this.policy
          ).execute(
            url,
            { ...plan, strategy: { ...plan.strategy, transport: candidate.transport } },
            {
              ...options,
              storageState: candidate.external ? undefined : options.storageState,
              timeoutMs: context.remaining(),
              signal: context.signal,
            }
          );
          const accessFailure = classifyReportFailure(execution.report);
          if (accessFailure) throw new AcquisitionFailureError(accessFailure, undefined);
          return execution;
        },
      })),
      context,
      (result) => isAcceptedExtractionQuality(result.report.quality),
      undefined,
      trace
    );
    result.report.trace = [...trace, ...(result.report.trace ?? [])];
    return result;
  }
}
