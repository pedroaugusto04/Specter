import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { renderEvalMarkdown } from './markdown.js';
import { summarizeEvalResults, type EvalSummary } from './summary.js';
import type { EvalCaseResult, EvalProviderInfo, EvalRunMeta } from './types.js';

export const DEFAULT_EVAL_REPORT_DIR = 'reports/evals';

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Directory name that keeps each provider/model report separate. */
export function providerSlug(provider: EvalProviderInfo): string {
  return slug(provider.model ? `${provider.name}-${provider.model}` : provider.name) || 'unknown';
}

export interface WrittenEvalReport {
  summary: EvalSummary;
  directory: string;
  latestDirectory: string;
}

/**
 * Writes `results.jsonl`, `summary.json` and `summary.md` to
 * `<baseDir>/<provider>/<suite>/<timestamp>/`, mirrored to `.../latest/`.
 */
export async function writeEvalReport(
  meta: EvalRunMeta,
  results: EvalCaseResult[],
  baseDir = DEFAULT_EVAL_REPORT_DIR
): Promise<WrittenEvalReport> {
  const summary = summarizeEvalResults(meta, results);
  const root = resolve(baseDir, providerSlug(meta.provider), slug(meta.suite));
  const directory = join(root, meta.startedAt.replace(/[:.]/g, '-'));
  const latestDirectory = join(root, 'latest');
  const files = {
    'results.jsonl': results.map((item) => JSON.stringify(item)).join('\n') + '\n',
    'summary.json': JSON.stringify(summary, null, 2) + '\n',
    'summary.md': renderEvalMarkdown(summary),
  };
  for (const target of [directory, latestDirectory]) {
    await mkdir(target, { recursive: true });
    await Promise.all(
      Object.entries(files).map(([name, content]) => writeFile(join(target, name), content))
    );
  }
  return { summary, directory, latestDirectory };
}
