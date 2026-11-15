import { describe, expect, it } from 'vitest';
import {
  parseEvalArgs,
  selectEvalCases,
  resolveProviderInfo,
  applyProviderOverride,
} from '../../src/evals/cli.js';
import type { EvalTags } from '../../src/evals/types.js';

describe('parseEvalArgs', () => {
  it('parses --provider, --model, --runs', () => {
    const opts = parseEvalArgs(['--provider=api', '--model', 'gpt-4', '--runs=3']);
    expect(opts.provider).toBe('api');
    expect(opts.model).toBe('gpt-4');
    expect(opts.runs).toBe(3);
  });

  it('parses --concurrency option', () => {
    const opts = parseEvalArgs(['--concurrency=1']);
    expect(opts.concurrency).toBe(1);
    expect(() => parseEvalArgs(['--concurrency=0'])).toThrow('--concurrency must be a positive integer.');
    expect(() => parseEvalArgs(['--concurrency=abc'])).toThrow('--concurrency must be a positive integer.');
  });

  it('parses --case with comma-separated values', () => {
    const opts = parseEvalArgs(['--case=a,b']);
    expect(opts.cases).toEqual(['a', 'b']);
  });

  it('rejects unknown and legacy options instead of silently ignoring them', () => {
    expect(() => parseEvalArgs(['--site=x'])).toThrow('Unknown option');
    expect(() => parseEvalArgs(['--scenario=x'])).toThrow('Unknown option');
    expect(() => parseEvalArgs(['--case=x', '--typo=y'])).toThrow('--typo');
  });

  it('parses --tag dimension=value', () => {
    const opts = parseEvalArgs(['--tag', 'siteType=news', '--tag', 'locale=pt-BR']);
    expect(opts.tags).toEqual({ siteType: 'news', locale: 'pt-BR' });
  });

  it('defaults runs to 1 and cases to empty', () => {
    const opts = parseEvalArgs([]);
    expect(opts.runs).toBe(1);
    expect(opts.cases).toEqual([]);
    expect(Object.keys(opts.tags)).toHaveLength(0);
  });

  it('rejects reuse of historical successes', () => {
    expect(() => parseEvalArgs(['--resume'])).toThrow('cached successes');
  });

  it('rejects non-positive --runs', () => {
    expect(() => parseEvalArgs(['--runs=0'])).toThrow();
    expect(() => parseEvalArgs(['--runs=-1'])).toThrow();
  });
});

describe('selectEvalCases', () => {
  interface MockCase {
    id: string;
    tags: EvalTags;
  }
  const cases: MockCase[] = [
    { id: 'news-1', tags: { siteType: 'news', locale: 'pt-BR' } },
    { id: 'ecom-1', tags: { siteType: 'ecommerce', locale: 'pt-BR' } },
    { id: 'ecom-2', tags: { siteType: 'ecommerce', locale: 'en-US' } },
  ];

  it('rejects duplicate ids even when filtered out', () => {
    expect(() => selectEvalCases([...cases, cases[0]!], { cases: ['ecom-1'], tags: {} })).toThrow(
      'Duplicate eval case id'
    );
  });

  it('returns all cases when no filters', () => {
    expect(selectEvalCases(cases, { cases: [], tags: {} })).toHaveLength(3);
  });

  it('filters by case id', () => {
    const selected = selectEvalCases(cases, { cases: ['news-1'], tags: {} });
    expect(selected.map((c) => c.id)).toEqual(['news-1']);
  });

  it('filters by tag', () => {
    const selected = selectEvalCases(cases, { cases: [], tags: { siteType: 'ecommerce' } });
    expect(selected.map((c) => c.id)).toEqual(['ecom-1', 'ecom-2']);
  });

  it('combines case id and tag filters', () => {
    const selected = selectEvalCases(cases, {
      cases: ['ecom-1', 'ecom-2'],
      tags: { locale: 'en-US' },
    });
    expect(selected.map((c) => c.id)).toEqual(['ecom-2']);
  });

  it('throws on unknown case ids', () => {
    expect(() => selectEvalCases(cases, { cases: ['nonexistent'], tags: {} })).toThrow(
      'nonexistent'
    );
  });
});

describe('resolveProviderInfo', () => {
  it('returns agy when no env is set', () => {
    expect(resolveProviderInfo({})).toEqual({ name: 'agy' });
  });

  it('returns name and model when COMPILER_PROVIDER=api', () => {
    const info = resolveProviderInfo({ COMPILER_PROVIDER: 'api', COMPILER_API_MODEL: 'flash' });
    expect(info).toEqual({ name: 'api', model: 'flash' });
  });

  it('does not include model for non-api providers', () => {
    const info = resolveProviderInfo({ COMPILER_PROVIDER: 'codex', COMPILER_API_MODEL: 'gpt-4' });
    expect(info).toEqual({ name: 'codex' });
  });
});

describe('applyProviderOverride', () => {
  it('sets COMPILER_PROVIDER and COMPILER_API_MODEL', () => {
    const target: Record<string, string> = {};
    applyProviderOverride({ provider: 'api', model: 'flash' }, target as NodeJS.ProcessEnv);
    expect(target.COMPILER_PROVIDER).toBe('api');
    expect(target.COMPILER_API_MODEL).toBe('flash');
  });

  it('does nothing when options are undefined', () => {
    const target: Record<string, string> = { COMPILER_PROVIDER: 'agy' };
    applyProviderOverride({}, target as NodeJS.ProcessEnv);
    expect(target.COMPILER_PROVIDER).toBe('agy');
  });
});
