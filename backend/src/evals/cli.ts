import type { EvalProviderInfo, EvalTags } from './types.js';

export interface EvalCliOptions {
  /** Overrides COMPILER_PROVIDER for this process. */
  provider?: string;
  /** Overrides COMPILER_API_MODEL for this process. */
  model?: string;
  runs: number;
  /** Case ids to run (comma separated `--case`). */
  cases: string[];
  /** Tag filters (`--tag siteType=news`), all must match. */
  tags: Record<string, string>;
  outputDir?: string;
}

function readFlags(argv: string[]): Map<string, string[]> {
  const flags = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!;
    if (!token.startsWith('--')) throw new Error('Unexpected argument: ' + token);
    const [rawName, inline] = token.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    const next = argv[index + 1];
    const value =
      inline ?? (next !== undefined && !next.startsWith('--') ? (index++, next) : 'true');
    flags.set(rawName, [...(flags.get(rawName) ?? []), value]);
  }
  return flags;
}

/**
 * Parses shared eval flags. Supports `--flag=value` and `--flag value`.
 */
export function parseEvalArgs(argv: string[]): EvalCliOptions {
  const flags = readFlags(argv);
  const last = (name: string) => flags.get(name)?.at(-1);
  const runs = Number(last('runs') ?? 1);
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer.');
  const tags: Record<string, string> = {};
  for (const entry of flags.get('tag') ?? []) {
    const [key, value] = entry.split('=', 2);
    if (!key || !value) throw new Error(`Invalid --tag "${entry}". Use --tag dimension=value.`);
    tags[key] = value;
  }
  const unknown = [...flags.keys()].filter(
    (name) => !['provider', 'model', 'runs', 'case', 'tag', 'out', 'resume'].includes(name)
  );
  if (unknown.length)
    throw new Error('Unknown option(s): ' + unknown.map((name) => '--' + name).join(', '));
  const cases = (flags.get('case') ?? [])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  const provider = last('provider');
  const model = last('model');
  const outputDir = last('out');
  if (flags.has('resume'))
    throw new Error(
      '--resume is no longer supported: cached successes bias benchmark results. Run a fresh suite or select cases with --case.'
    );
  return {
    runs,
    cases,
    tags,
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(outputDir ? { outputDir } : {}),
  };
}

/**
 * Applies CLI overrides to the environment. Must run before `config/env.js` is imported,
 * because the environment is validated once at import time.
 */
export function applyProviderOverride(
  options: Pick<EvalCliOptions, 'provider' | 'model'>,
  target: NodeJS.ProcessEnv = process.env
): void {
  if (options.provider) target.COMPILER_PROVIDER = options.provider;
  if (options.model) target.COMPILER_API_MODEL = options.model;
}

/** Describes the active provider for report metadata, without depending on any vendor. */
export function resolveProviderInfo(source: NodeJS.ProcessEnv = process.env): EvalProviderInfo {
  const name = source.COMPILER_PROVIDER || 'agy';
  const model = source.COMPILER_API_MODEL?.trim();
  return name === 'api' && model ? { name, model } : { name };
}

export function selectEvalCases<T extends { id: string; tags: EvalTags }>(
  cases: T[],
  options: Pick<EvalCliOptions, 'cases' | 'tags'>
): T[] {
  const seen = new Set<string>();
  for (const item of cases) {
    if (seen.has(item.id)) throw new Error(`Duplicate eval case id: ${item.id}`);
    seen.add(item.id);
  }
  const unknown = options.cases.filter((id) => !cases.some((item) => item.id === id));
  if (unknown.length) throw new Error(`Unknown eval case(s): ${unknown.join(', ')}.`);
  return cases.filter((item) => {
    if (options.cases.length && !options.cases.includes(item.id)) return false;
    return Object.entries(options.tags).every(([key, expected]) => {
      const value = item.tags[key];
      return Array.isArray(value) ? value.includes(expected) : value === expected;
    });
  });
}

export function describeFilters(options: Pick<EvalCliOptions, 'cases' | 'tags'>) {
  return {
    ...(options.cases.length ? { cases: options.cases } : {}),
    ...(Object.keys(options.tags).length
      ? { tags: Object.entries(options.tags).map(([k, v]) => `${k}=${v}`) }
      : {}),
  };
}
