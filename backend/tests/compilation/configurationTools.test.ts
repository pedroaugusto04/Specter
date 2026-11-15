import { describe, expect, it } from 'vitest';
import { executeConfigurationTool, observation } from '../../src/extraction/configurationTools.js';
import { createConfigurationModel } from '../../src/extraction/configurationModel.js';
import type { DocumentSession } from '../../src/extraction/contracts.js';
import { env } from '../../src/config/env.js';
const snapshot = {
  url: 'https://example.com/?token=secret',
  httpStatus: 200,
  responses: [
    {
      url: 'https://example.com/api/items',
      method: 'GET',
      status: 200,
      body: { token: 'secret', items: [1] },
    },
  ],
  html: '<main><b class="price" onclick="track()" data-tracking-id="secret">100</b><b class="price">200</b></main><script type="application/ld+json">{"@type":"Product","name":"Chair"}</script>',
};
const session: DocumentSession = {
  snapshot: async () => snapshot,
  check: async () => undefined,
  discover: async () => snapshot,
  advance: async () => {},
  screenshot: async () => undefined,
  close: async () => {},
  capabilities: { interactions: false, networkResponses: false, scopedDocuments: false },
};
describe('Generic configuration observations', () => {
  it('queries original counts and values without retaining executable/tracking attributes', async () => {
    const result = await executeConfigurationTool(session, {
      kind: 'query',
      selector: '.price',
      attribute: 'text',
    });
    expect(result.result).toMatchObject({
      count: 2,
      samples: [{ value: '100' }, { value: '200' }],
    });
    expect(JSON.stringify(result.result)).not.toContain('onclick');
    expect(JSON.stringify(result.result)).not.toContain('data-tracking');
  });
  it('returns structured data without constructing synthetic selectors', async () => {
    const result = await executeConfigurationTool(session, { kind: 'structured' });
    expect(result.result).toEqual([{ '@type': 'Product', name: 'Chair' }]);
    const evidence = observation(snapshot, 5000);
    expect(evidence).not.toContain('<script');
    expect(evidence).not.toContain('product:price:amount');
    expect(evidence).not.toContain('token=secret');
  });
  it('preserves structured data and observed responses when large HTML is truncated', () => {
    const oversizedSnapshot = {
      ...snapshot,
      html: `<header>${'<span>nav-item</span>'.repeat(500)}</header><main><h1>Chair</h1></main><script type="application/ld+json">{"@type":"Product","name":"Chair","offers":{"price":"199.90"}}</script>`,
    };
    const encoded = observation(oversizedSnapshot, 2000);
    const parsed = JSON.parse(encoded) as { content: string; truncated: boolean };
    expect(parsed.truncated).toBe(true);
    expect(parsed.content).toContain('Observed responses:');
    expect(parsed.content).toContain('/api/items');
    expect(parsed.content).toContain('Structured data (untrusted JSON):');
    expect(parsed.content).toContain('199.90');
  });
  it('filters observed responses and redacts secrets', async () => {
    const result = await executeConfigurationTool(session, {
      kind: 'responses',
      urlPattern: '/api/items',
    });
    expect(result.result).toMatchObject([{ body: { token: '[REDACTED]', items: [1] } }]);
  });
  it('rejects interactions unsupported by the document', async () => {
    await expect(
      executeConfigurationTool(session, { kind: 'interact', action: { kind: 'scroll' } })
    ).rejects.toThrow('cannot perform');
  });
  it('limits input including schema/instructions while retaining the original request', async () => {
    const original = 'Requested entity with its original conditions';
    const model = createConfigurationModel({
      name: 'bounded',
      generate: async (input) => {
        expect(
          input.instructions.length +
            JSON.stringify(input.outputSchema).length +
            input.evidence.length
        ).toBeLessThanOrEqual(env.CONFIGURATION_MAX_INPUT_CHARS);
        expect(JSON.parse(input.evidence).userRequest).toBe(original);
        expect(input.evidence).toContain('EVIDENCE TRUNCATED');
        return { kind: 'tool', tool: { kind: 'structured' } };
      },
    });
    await model.decide({
      jobId: 'bounded',
      url: snapshot.url,
      prompt: original,
      evidence: '"'.repeat(300000),
      timeoutMs: 1000,
    });
  });
});
