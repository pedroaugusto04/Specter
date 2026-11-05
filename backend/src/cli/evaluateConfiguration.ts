import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ConfigurationEvaluationCase } from '../extraction/configurationEvaluation.js';

// The eval command does not use application encryption, database or session state.
process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);
// Keep stdout machine-readable; aggregate per-stage metrics are included in the report.
process.env.LOG_LEVEL ||= 'silent';
// Configuration evals never send notifications and must not require Resend credentials.
process.env.NOTIFICATION_PROVIDER = 'console';
// Fixture-backed evaluations do not use the configured compiler provider. Avoid
// requiring live API credentials just because deployment config selects `api`.
if (process.env.EVALS_LIVE_MODELS_ENABLED !== 'true') process.env.COMPILER_PROVIDER = 'agy';

const [
  { createFixtureModelProvider, evaluateConfigurationCorpus, validateConfigurationEvaluationCase },
  { env },
  { createCompilerProvider },
] = await Promise.all([
  import('../extraction/configurationEvaluation.js'),
  import('../config/env.js'),
  import('../providers/compilers/compiler.factory.js'),
]);

const corpus = JSON.parse(
  await readFile(resolve('tests/fixtures/configuration-evaluation-corpus.json'), 'utf8')
) as { version: number; cases: ConfigurationEvaluationCase[] };

if (corpus.version !== 1) throw new Error('Unsupported configuration evaluation corpus.');
for (const item of corpus.cases) validateConfigurationEvaluationCase(item);

const liveModelsEnabled = env.EVALS_LIVE_MODELS_ENABLED;
if (liveModelsEnabled)
  process.stderr.write(
    `Live model evaluation enabled; provider=${env.COMPILER_PROVIDER}. This may incur provider usage.\n`
  );

const report = await evaluateConfigurationCorpus(
  corpus.cases,
  liveModelsEnabled
    ? createCompilerProvider()
    : (item) => createFixtureModelProvider(item.responses)
);
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (report.results.some((result) => !result.passed)) process.exitCode = 1;
