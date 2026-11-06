import { createModelStages } from '../src/extraction/modelStages.js';
import { fixturePlan } from './helpers/extractionFixtures.js';
import { describe, expect, it, vi } from 'vitest';
import { GeminiApiCompilerProvider } from '../src/providers/compilers/geminiApiCompiler.provider.js';
import {
  CompilerApiRequestError,
  CompilerTimeoutError,
  CompilerValidationError,
} from '../src/errors/domainErrors.js';

const input = {
  jobId: 'gemini-test',
  task: 'plan' as const,
  instructions: 'Return a plan as JSON',
  evidence: '{"title":"Example"}',
  outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
  timeoutMs: 5000,
};

function provider(fetchFn: typeof fetch) {
  return new GeminiApiCompilerProvider({
    model: 'gemini-test-model',
    apiKey: 'test-secret',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
    fetchFn,
  });
}

describe('Gemini API compiler transport', () => {
  it('sends task and evidence to Gemini and returns parsed JSON', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-secret' });
      const body = JSON.parse(String(init?.body));
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(body.generationConfig.responseJsonSchema).toEqual(input.outputSchema);
      for (const parameter of ['temperature', 'topP', 'topK'])
        expect(body.generationConfig).not.toHaveProperty(parameter);
      expect(body.systemInstruction.parts[0].text).toContain('untrusted data');
      expect(body.contents[0].parts[0].text).toContain(input.instructions);
      expect(body.contents[0].parts[1].text).toContain(input.evidence);
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
    });

    await expect(provider(fetchFn).generate(input)).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('delivers the stage schema only through the structured output contract', async () => {
    const plan = fixturePlan();
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.generationConfig.responseJsonSchema.type).toBe('object');
      expect(body.generationConfig.responseJsonSchema.properties).toHaveProperty('fields');
      expect(body.generationConfig.responseJsonSchema.properties).not.toHaveProperty('pagination');
      const prompt = body.contents[0].parts[0].text;
      expect(prompt).not.toContain(JSON.stringify(body.generationConfig.responseJsonSchema));
      expect(prompt).not.toContain('matching this schema:');
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(plan.strategy) }] } }],
      });
    });
    await expect(
      createModelStages(provider(fetchFn)).generator.generate(
        {
          jobId: 'contract',
          url: 'https://example.com',
          prompt: 'Title',
          evidence: '<h1>Title</h1>',
          timeoutMs: 1000,
        },
        plan.intent,
        ''
      )
    ).resolves.toEqual(plan.strategy);
  });

  it('maps timeouts and transient HTTP failures to retryable domain errors', async () => {
    const timeoutFetch = vi.fn<typeof fetch>(async () => {
      throw new DOMException('timeout', 'TimeoutError');
    });
    await expect(provider(timeoutFetch).generate(input)).rejects.toBeInstanceOf(
      CompilerTimeoutError
    );

    const rejectedFetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 429 }));
    await expect(provider(rejectedFetch).generate(input)).rejects.toMatchObject({
      code: 'COMPILER_API_REJECTED',
      isRetryable: true,
    } satisfies Partial<CompilerApiRequestError>);
  });

  it('rejects missing, truncated, and malformed model output', async () => {
    const noCandidate = vi.fn<typeof fetch>(async () => Response.json({ candidates: [] }));
    await expect(provider(noCandidate).generate(input)).rejects.toBeInstanceOf(
      CompilerValidationError
    );

    const truncated = vi.fn<typeof fetch>(async () =>
      Response.json({
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }],
      })
    );
    await expect(provider(truncated).generate(input)).rejects.toBeInstanceOf(
      CompilerValidationError
    );

    const invalidJson = vi.fn<typeof fetch>(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] })
    );
    await expect(provider(invalidJson).generate(input)).rejects.toBeInstanceOf(
      CompilerValidationError
    );
  });
});
