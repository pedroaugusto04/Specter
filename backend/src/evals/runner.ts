import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
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
  /** Maximum simultaneous executions. Defaults to 1. */
  concurrency?: number;
  log?: (line: string) => void;
}

/** Runs every selected case the requested number of times with bounded concurrency. */
export async function runEvalSuite<T extends EvalCaseDefinition>(
  suite: EvalSuiteOptions<T>
): Promise<WrittenEvalReport> {
  const log = suite.log ?? ((line: string) => process.stdout.write(line + '\n'));
  const provider = resolveProviderInfo();
  const startedAt = new Date().toISOString();
  const total = suite.cases.length * suite.options.runs;
  const concurrency = Math.max(1, Math.min(total, suite.concurrency ?? 1));
  if (!Number.isInteger(concurrency)) throw new Error('Eval concurrency must be a positive integer.');
  const results: EvalCaseResult[] = new Array(total);
  let completed = 0;
  let nextIndex = 0;
  let nextStartAt = 0;
  log(
    `▶ ${suite.suite} (${suite.tier}) · provider=${provider.name}${provider.model ? ` model=${provider.model}` : ''} · ${suite.cases.length} casos × ${suite.options.runs} runs · concorrência=${concurrency}`
  );

  const waitForStartSlot = async () => {
    if (!suite.delayMs) return;
    const now = Date.now();
    const startAt = Math.max(now, nextStartAt);
    nextStartAt = startAt + suite.delayMs;
    if (startAt > now) await new Promise((resolve) => setTimeout(resolve, startAt - now));
  };
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= total) return;
      const item = suite.cases[index % suite.cases.length]!;
      const run = Math.floor(index / suite.cases.length) + 1;
      await waitForStartSlot();
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
      results[index] = result;
      completed++;
      const mark = SuccessfulOutcomes.has(result.outcome) ? '✔' : '✖';
      log(
        `  ${mark} [${completed}/${total}] ${item.id} run=${run} ${result.outcome} ${result.durationMs}ms${result.reason && mark === '✖' ? ` · ${result.reason.slice(0, 160)}` : ''}`
      );
      try {
        const outDir = resolve(suite.options.outputDir ?? 'reports/evals');
        await mkdir(outDir, { recursive: true });
        await appendFile(resolve(outDir, 'live-stream.jsonl'), JSON.stringify(result) + '\n');
      } catch {
        // non-blocking progressive log
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

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
