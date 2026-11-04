import { readFile } from 'node:fs/promises';
import { PageExtractor } from '../src/extraction/pageExtractor.js';
import { standardSourceReaders } from '../src/extraction/sources.js';
import { evaluateCorpus, type EvaluationCase } from '../src/extraction/evaluation.js';
import { extractionPlanSchema } from '../src/types/extractionPlan.js';
const corpus = JSON.parse(
  await readFile(new URL('../tests/fixtures/extraction-corpus.json', import.meta.url), 'utf8')
) as { version: number; cases: EvaluationCase[] };
if (corpus.version !== 1) throw new Error('Unsupported evaluation corpus.');
for (const item of corpus.cases) extractionPlanSchema.parse(item.plan);
const metrics = evaluateCorpus(corpus.cases, new PageExtractor(standardSourceReaders()));
process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
if (metrics.results.some((item) => !item.passed)) process.exitCode = 1;
