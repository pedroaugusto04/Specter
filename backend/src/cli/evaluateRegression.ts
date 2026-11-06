import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { ConfigurationEvaluationCase } from '../extraction/configurationEvaluation.js';
import type { EvaluationCase } from '../extraction/evaluation.js';

// This entry point is deliberately offline, regardless of deployment settings.
process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.LOG_LEVEL = 'silent';
process.env.NOTIFICATION_PROVIDER = 'console';
process.env.COMPILER_PROVIDER = 'agy';

const [
  configuration,
  { evaluateCorpus },
  { PageExtractor },
  { standardSourceReaders },
  { extractionPlanSchema },
] = await Promise.all([
  import('../extraction/configurationEvaluation.js'),
  import('../extraction/evaluation.js'),
  import('../extraction/pageExtractor.js'),
  import('../extraction/sources.js'),
  import('../types/extractionPlan.js'),
]);
const directory = resolve('reports/evals');
await mkdir(directory, { recursive: true });
const configurationJson = await readFile(
  new URL('../../tests/fixtures/configuration-evaluation-corpus.json', import.meta.url),
  'utf8'
);
const extractionJson = await readFile(
  new URL('../../tests/fixtures/extraction-corpus.json', import.meta.url),
  'utf8'
);
const configurationCorpus = JSON.parse(configurationJson) as {
  version: number;
  cases: ConfigurationEvaluationCase[];
};
const extractionCorpus = JSON.parse(extractionJson) as { version: number; cases: EvaluationCase[] };
if (configurationCorpus.version !== 1 || extractionCorpus.version !== 1)
  throw new Error('Unsupported evaluation corpus version.');
configurationCorpus.cases.forEach(configuration.validateConfigurationEvaluationCase);
extractionCorpus.cases.forEach((item) => extractionPlanSchema.parse(item.plan));
const configurationReport = await configuration.evaluateConfigurationCorpus(
  configurationCorpus.cases,
  (item) => configuration.createFixtureModelProvider(item.responses)
);
const { evaluateIsolatedStages } = await import('../extraction/stageEvaluation.js');
const isolatedStages = await evaluateIsolatedStages(configurationCorpus.cases, (item) =>
  configuration.createFixtureModelProvider(item.responses)
);
const extractionReport = evaluateCorpus(
  extractionCorpus.cases,
  new PageExtractor(standardSourceReaders())
);
const passed =
  isolatedStages.passed &&
  [...configurationReport.results, ...extractionReport.results].every((item) => item.passed);
const report = {
  reportVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: 'offline-recorded-models',
  nodeVersion: process.version,
  corpusHash: createHash('sha256').update(configurationJson).update(extractionJson).digest('hex'),
  passed,
  configuration: configurationReport,
  extraction: extractionReport,
  isolatedStages,
};
await writeFile(resolve(directory, 'regression.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (!passed) process.exitCode = 1;
