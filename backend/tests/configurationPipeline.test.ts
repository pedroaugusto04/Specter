import { describe, it, expect, vi } from 'vitest';
import { ConfigurationPipeline } from '../src/extraction/configuration.js';

import { createConfigurationModel } from '../src/extraction/configurationModel.js';
import { fixturePlan } from './helpers/extractionFixtures.js';
import type { ConfigurationDecision, IModelProvider } from '../src/extraction/model.js';
import type { DocumentAdapter } from '../src/extraction/contracts.js';
import type { IExtractionExecutor, ExecutionResult } from '../src/extraction/executor.js';
import { CompilerApiRequestError } from '../src/errors/domainErrors.js';
const plan = fixturePlan();
const snapshot = {
  html: '<h1>Product</h1>',
  url: 'https://example.com',
  httpStatus: 200,
  responses: [],
};
const request = { jobId: 'fixture', url: snapshot.url, prompt: 'Track title' };
function setup(
  options: {
    decisions?: unknown[];
    review?: unknown;
    enabled?: boolean;
    maxDecisions?: number;
    maxAttempts?: number;
    budgetMs?: number;
    decisionDelayMs?: number;
  } = {}
) {
  const calls: string[] = [];
  const inputs: string[] = [];
  const decisions = [...(options.decisions ?? [{ kind: 'candidate', plan }])];
  const model: IModelProvider = {
    name: 'fixture',
    generate: async (input) => {
      if (input.task === 'configure' && options.decisionDelayMs)
        await new Promise((resolve) => setTimeout(resolve, options.decisionDelayMs));
      calls.push(input.task);
      inputs.push(input.evidence);
      const output =
        input.task === 'configure'
          ? decisions.shift()
          : (options.review ?? { score: 8, reasons: ['Matched'], evidenceRefs: ['title'] });
      if (output instanceof Error) throw output;
      return output;
    },
  };
  const close = vi.fn(async () => {});
  const discover = vi.fn(async () => snapshot);
  const open = vi.fn(async () => ({
    snapshot: async () => snapshot,
    check: async () => undefined,
    advance: async () => {},
    discover,
    screenshot: async () => undefined,
    close,
    capabilities: { interactions: true, networkResponses: true, scopedDocuments: true },
  }));
  const adapter: DocumentAdapter = { open };
  const execution: ExecutionResult = {
    data: { title: 'Product' },
    report: {
      quality: 'COMPLETE',
      scope: 'page',
      pagesVisited: 1,
      issues: [],
      sourcesUsed: {},
      evidence: [],
    },
    snapshot: { ...snapshot, html: '<h1>Validated product</h1>' },
    durationMs: 0,
  };
  const execute = vi.fn<IExtractionExecutor['execute']>(async () => structuredClone(execution));
  const pipeline = new ConfigurationPipeline(
    createConfigurationModel(model),
    adapter,
    { execute },
    {
      budgetMs: options.budgetMs ?? 5000,
      maxAttempts: options.maxAttempts ?? 3,
      maxDecisions: options.maxDecisions ?? 6,
      reviewReserveMs: Math.min(500, (options.budgetMs ?? 5000) / 4),
      evidenceLimit: 20000,
      semanticEnabled: options.enabled ?? true,
      semanticThreshold: 4,
    }
  );
  return { pipeline, calls, inputs, execute, close, open, discover };
}
describe('Bounded configuration with tools', () => {
  it('configures directly with one decision and one review using validation evidence', async () => {
    const fixture = setup();
    await expect(fixture.pipeline.configure(request)).resolves.toMatchObject({
      semanticReview: { status: 'PASSED' },
    });
    expect(fixture.calls).toEqual(['configure', 'semantic']);
    expect(fixture.inputs[1]).toContain('Validated product');
    expect(fixture.close).toHaveBeenCalledOnce();
  });
  it('treats the total configuration deadline as final rather than a queue retry', async () => {
    const fixture = setup({ budgetMs: 60, decisionDelayMs: 90 });
    await expect(fixture.pipeline.configure(request)).rejects.toMatchObject({
      code: 'CONFIGURATION_REJECTED',
      isRetryable: false,
      message: 'Configuration deadline exhausted.',
    });
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('skips the reviewer only when explicitly disabled', async () => {
    const fixture = setup({ enabled: false });
    expect((await fixture.pipeline.configure(request)).semanticReview.status).toBe('SKIPPED');
    expect(fixture.calls).toEqual(['configure']);
  });
  for (const review of [
    new Error('Unavailable'),
    { score: 'bad' },
    { score: 2, reasons: ['Wrong entity'], evidenceRefs: ['title'] },
  ])
    it('does not activate on rejected or unavailable semantic review', async () => {
      const fixture = setup({ review });
      await expect(fixture.pipeline.configure(request)).rejects.toThrow(/Semantic review/);
      expect(fixture.calls.filter((call) => call === 'semantic')).toHaveLength(1);
    });
  it('does not recompile on a provider rate limit', async () => {
    const error = new CompilerApiRequestError(429);
    const fixture = setup({ decisions: [error] });
    await expect(fixture.pipeline.configure(request)).rejects.toBe(error);
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.calls).toHaveLength(1);
  });
  it('rejects a modified recovery contract', async () => {
    const fixture = setup({
      decisions: [
        {
          kind: 'candidate',
          plan: { ...plan, intent: { ...plan.intent, entity: 'Another product' } },
        },
      ],
    });
    await expect(fixture.pipeline.configure({ ...request, intent: plan.intent })).rejects.toThrow(
      'cannot change'
    );
    expect(fixture.execute).not.toHaveBeenCalled();
  });
  it('returns invalid-output feedback and limits decisions', async () => {
    const fixture = setup({ decisions: [{ nonsense: true }, { nonsense: true }], maxDecisions: 2 });
    await expect(fixture.pipeline.configure(request)).rejects.toThrow();
    expect(fixture.calls).toHaveLength(2);
    expect(fixture.execute).not.toHaveBeenCalled();
  });
  it('counts invalid candidates against the candidate budget', async () => {
    const fixture = setup({ decisions: [{ kind: 'candidate', plan: {} }], maxAttempts: 1 });
    await expect(fixture.pipeline.configure(request)).rejects.toThrow();
    expect(fixture.calls).toHaveLength(1);
  });
  it('stops repeating a rejected candidate without executing it again', async () => {
    const candidate = { kind: 'candidate', plan };
    const fixture = setup({ decisions: [candidate, candidate] });
    fixture.execute.mockResolvedValue({
      data: {},
      report: {
        quality: 'INVALID',
        scope: 'page',
        pagesVisited: 1,
        issues: ['Missing required title'],
        sourcesUsed: {},
      },
      snapshot,
      durationMs: 0,
    });
    await expect(fixture.pipeline.configure(request)).rejects.toThrow('Repeated rejected');
    expect(fixture.execute).toHaveBeenCalledOnce();
    expect(fixture.inputs[1]).toContain('Missing required title');
  });
  it('replays interactions when reopening investigation after validation failure', async () => {
    const action = {
      kind: 'click' as const,
      locator: { kind: 'css' as const, selector: '.details' },
    };
    const corrected = {
      ...plan,
      strategy: { ...plan.strategy, transport: 'browser', setup: [action] },
    };
    const decisions: ConfigurationDecision[] = [
      { kind: 'tool', tool: { kind: 'interact', action } },
      { kind: 'candidate', plan },
      { kind: 'candidate', plan: corrected },
    ];
    const fixture = setup({ decisions });
    fixture.execute.mockResolvedValueOnce({
      data: {},
      report: {
        quality: 'INVALID',
        scope: 'page',
        pagesVisited: 1,
        issues: ['Preparation required'],
        sourcesUsed: {},
      },
      snapshot,
      durationMs: 0,
    });
    await fixture.pipeline.configure(request);
    expect(fixture.open).toHaveBeenCalledTimes(2);
    expect(fixture.discover).toHaveBeenCalledTimes(2);
    expect(fixture.execute.mock.calls[1]![1]).toMatchObject({ strategy: { setup: [action] } });
  });
  it('stops a repeated tool without progress', async () => {
    const tool = { kind: 'tool', tool: { kind: 'query', selector: 'h1', attribute: 'text' } };
    const fixture = setup({ decisions: [tool, tool, tool, tool] });
    await expect(fixture.pipeline.configure(request)).rejects.toThrow('without progress');
    expect(fixture.calls).toHaveLength(3);
    expect(fixture.close).toHaveBeenCalledOnce();
  });
  it('rejects partial extraction before review', async () => {
    const fixture = setup({ maxAttempts: 1 });
    fixture.execute.mockResolvedValue({
      data: {},
      report: {
        quality: 'PARTIAL',
        scope: 'page',
        pagesVisited: 1,
        issues: ['Incomplete collection'],
        sourcesUsed: {},
      },
      snapshot,
      durationMs: 0,
    });
    await expect(fixture.pipeline.configure(request)).rejects.toThrow('Incomplete collection');
    expect(fixture.calls).toEqual(['configure']);
  });
  it('samples large collection items and provenance before semantic review', async () => {
    const fixture = setup();
    fixture.execute.mockResolvedValue({
      data: {
        items: Array.from({ length: 60 }, (_, idx) => ({ title: `Item ${idx + 1}` })),
        count: 60,
      },
      report: {
        quality: 'COMPLETE',
        scope: 'collection',
        pagesVisited: 1,
        issues: [],
        sourcesUsed: { dom: 60 },
        evidence: Array.from({ length: 55 }, (_, idx) => ({
          recordIdentity: String(idx),
          field: 'title',
          sourceIndex: 0,
          source: { kind: 'dom' as const, selector: '.title', attribute: 'text' },
          raw: `Item ${idx + 1}`,
          value: `Item ${idx + 1}`,
        })),
        coverage: 'COMPLETE',
      },
      snapshot: { ...snapshot, html: '<h1>Validated collection</h1>' },
      durationMs: 0,
    });
    await expect(fixture.pipeline.configure(request)).resolves.toMatchObject({
      semanticReview: { status: 'PASSED' },
    });
    const reviewPacket = JSON.parse(fixture.inputs[1]!) as {
      context: {
        result: {
          data: { items: unknown[]; count: number; truncatedItems: boolean };
          provenance: unknown[];
        };
      };
    };
    expect(reviewPacket.context.result.data.count).toBe(60);
    expect(reviewPacket.context.result.data.truncatedItems).toBe(true);
    expect(reviewPacket.context.result.data.items).toHaveLength(25);
    expect(reviewPacket.context.result.provenance).toHaveLength(40);
  });
});
