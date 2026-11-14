import { classifyEvalError } from './outcomes.js';
import { describeFilters, resolveProviderInfo, type EvalCliOptions } from './cli.js';
import { writeEvalReport, type WrittenEvalReport } from './report.js';
import { SuccessfulOutcomes, type EvalCaseResult, type EvalTags, type EvalTier } from './types.js';

export interface EvalCaseDefinition {
  id: string;
  name: string;
  tags: EvalTags;
}

/** What a suite reports for one execution; timing and identity are filled by the runner. */
export type EvalExecution = Omit<
  EvalCaseResult,
  'caseId' | 'caseName' | 'run' | 'tags' | 'durationMs'
>;

export interface EvalSuiteOptions<T extends EvalCaseDefinition> {
  suite: string;
  tier: EvalTier;
  cases: T[];
  options: EvalCliOptions;
  execute: (item: T, run: number) => Promise<EvalExecution>;
  /** Pause between executions (e.g. provider rate limits). */
  delayMs?: number;
  log?: (line: string) => void;
}

/** Runs every selected case `runs` times sequentially, classifies errors and writes the report. */
export async function runEvalSuite<T extends EvalCaseDefinition>(
  suite: EvalSuiteOptions<T>
): Promise<WrittenEvalReport> {
  const log = suite.log ?? ((line: string) => process.stdout.write(line + '\n'));
  const provider = resolveProviderInfo();
  const startedAt = new Date().toISOString();
  const results: EvalCaseResult[] = [];
  const total = suite.cases.length * suite.options.runs;
  log(
    `▶ ${suite.suite} (${suite.tier}) · provider=${provider.name}${provider.model ? ` model=${provider.model}` : ''} · ${suite.cases.length} casos × ${suite.options.runs} runs`
  );

  for (let run = 1; run <= suite.options.runs; run++) {
    for (const item of suite.cases) {
      const started = Date.now();
      let execution: EvalExecution;
      try {
        execution = await suite.execute(item, run);
      } catch (error) {
        execution = { ...classifyEvalError(error), records: 0 };
      }
      const result: EvalCaseResult = {
        caseId: item.id,
        caseName: item.name,
        run,
        tags: item.tags,
        durationMs: Date.now() - started,
        ...execution,
      };
      results.push(result);
      const mark = SuccessfulOutcomes.has(result.outcome) ? '✔' : '✖';
      log(
        `  ${mark} [${results.length}/${total}] ${item.id} run=${run} ${result.outcome} ${result.durationMs}ms${result.reason && mark === '✖' ? ` · ${result.reason.slice(0, 160)}` : ''}`
      );
      if (suite.delayMs && results.length < total)
        await new Promise((resolve) => setTimeout(resolve, suite.delayMs));
    }
  }

  const report = await writeEvalReport(
    {
      suite: suite.suite,
      tier: suite.tier,
      provider,
      runs: suite.options.runs,
      startedAt,
      finishedAt: new Date().toISOString(),
      nodeVersion: process.version,
      filters: describeFilters(suite.options),
    },
    results,
    suite.options.outputDir
  );
  const { overall } = report.summary;
  log(
    `■ ${overall.passed}/${overall.scored} (${(overall.rate * 100).toFixed(1)}%) · pass^k ${overall.consistentCases}/${overall.cases} · relatório: ${report.latestDirectory}/summary.md`
  );
  return report;
}
