import { createModelStages } from '../src/extraction/modelStages.js';
import { describe, it, expect, vi } from 'vitest';
import { ConfigurationPipeline } from '../src/extraction/configuration.js';
import type { IModelProvider } from '../src/extraction/model.js';
import type { DocumentAdapter } from '../src/extraction/contracts.js';
import type { ExecutionResult } from '../src/extraction/executor.js';
import { fixturePlan } from './helpers/extractionFixtures.js';
const snapshot = {
  html: '<h1>Main product</h1><b>100</b>',
  url: 'https://example.com',
  httpStatus: 200,
  responses: [],
};
const plan = fixturePlan();
function setup(review: unknown, enabled = true) {
  const calls: string[] = [];
  const model: IModelProvider = {
    name: 'fixture',
    generate: async (input) => {
      calls.push(input.task);
      if (input.task === 'intent') return plan.intent;
      if (input.task === 'discovery') return { action: null };
      if (input.task === 'plan') return plan.strategy;
      if (review instanceof Error) throw review;
      return review;
    },
  };
  const discover = vi.fn(async () => snapshot);
  const adapter: DocumentAdapter = {
    open: async () => ({
      snapshot: async () => snapshot,
      check: async () => undefined,
      advance: async () => {},
      discover,
      screenshot: async () => undefined,
      close: async () => {},
    }),
  };
  const execution: ExecutionResult = {
    data: { title: 'Main product' },
    report: {
      quality: 'COMPLETE',
      scope: 'page',
      pagesVisited: 1,
      issues: [],
      sourcesUsed: { 'title#0': 1 },
      evidence: [],
    },
    snapshot,
  };
  const execute = vi.fn(async () => structuredClone(execution));
  const pipeline = new ConfigurationPipeline(
    createModelStages(model),
    adapter,
    { execute },
    {
      budgetMs: 5000,
      maxAttempts: 1,
      maxDiscoveryActions: 2,
      evidenceLimit: 10000,
      semanticEnabled: enabled,
      semanticThreshold: 4,
    }
  );
  return { pipeline, calls, execute, discover };
}
const request = { jobId: 'fixture', url: snapshot.url, prompt: 'Find the title' };
describe('Semantic policy and pipeline stages', () => {
  it('never calls reviewer and never gates when disabled per monitor', async () => {
    const fixture = setup({ score: 0, reasons: ['Wrong entity'], evidenceRefs: ['title'] });
    const result = await fixture.pipeline.configure({
      ...request,
      semanticPolicy: { enabled: false },
    });
    expect(result.semanticReview.status).toBe('SKIPPED');
    expect(fixture.calls).not.toContain('semantic');
    expect(result.execution.report.trace?.find((step) => step.stage === 'semantic')?.status).toBe(
      'SKIPPED'
    );
  });
  it('blocks score three, accepts four, records uncertainties', async () => {
    await expect(
      setup({ score: 3, reasons: ['Wrong product'], evidenceRefs: ['title'] }).pipeline.configure(
        request
      )
    ).rejects.toThrow('rejected');
    const result = await setup({
      score: 4,
      reasons: ['Uncertain context'],
      evidenceRefs: ['title'],
    }).pipeline.configure(request);
    expect(result.semanticReview).toMatchObject({ status: 'WARNING', score: 4 });
  });
  it('records reviewer outage without blocking validated data', async () => {
    const result = await setup(new Error('Unavailable')).pipeline.configure(request);
    expect(result.semanticReview.status).toBe('ERROR');
  });
  it('honors per-monitor threshold and frozen recovery intent', async () => {
    const fixture = setup({ score: 6, reasons: ['Partly ambiguous'], evidenceRefs: ['title'] });
    await expect(
      fixture.pipeline.configure({
        ...request,
        intent: plan.intent,
        semanticPolicy: { threshold: 7 },
      })
    ).rejects.toThrow('rejected');
    expect(fixture.calls).not.toContain('intent');
  });
  it('uses the global disabled policy without invoking the reviewer', async () => {
    const fixture = setup({ score: 0, reasons: ['Wrong'], evidenceRefs: ['title'] }, false);
    const result = await fixture.pipeline.configure(request);
    expect(result.semanticReview.status).toBe('SKIPPED');
    expect(fixture.calls).not.toContain('semantic');
  });
  it('does not semantically review incomplete data', async () => {
    const fixture = setup({ score: 10, reasons: ['Good'], evidenceRefs: ['title'] });
    fixture.execute.mockResolvedValue({
      data: {},
      report: {
        quality: 'PARTIAL',
        scope: 'page',
        pagesVisited: 1,
        issues: ['Missing coverage'],
        sourcesUsed: {},
      },
      snapshot,
    });
    await expect(fixture.pipeline.configure(request)).rejects.toThrow('Missing coverage');
    expect(fixture.calls).not.toContain('semantic');
  });
});
