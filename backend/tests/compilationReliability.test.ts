import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ConfigurationPipeline } from '../src/extraction/configuration.js';
import { createModelStages } from '../src/extraction/modelStages.js';
import { modelDiscoverySchema, modelStrategySchema } from '../src/extraction/modelOutputSchemas.js';
import { PageExtractor } from '../src/extraction/pageExtractor.js';
import { standardSourceReaders } from '../src/extraction/sources.js';
import { ExtractionExecutor } from '../src/extraction/executor.js';
import type { DocumentAdapter, ExecutionStrategy, Source } from '../src/extraction/contracts.js';
import type { IModelProvider, ModelInput } from '../src/extraction/model.js';
import { fixturePlan, fixturePolicy } from './helpers/extractionFixtures.js';

const corpus = JSON.parse(
  await readFile('tests/fixtures/production-extraction-regressions.json', 'utf8')
) as {
  cases: Array<{
    name: string;
    html: string;
    source: Source;
    records: ExecutionStrategy['records'];
    quality: string;
    price?: number;
    httpStatus?: number;
  }>;
};
const extractor = new PageExtractor(standardSourceReaders());
const pricePlan = () =>
  fixturePlan({
    fields: {
      price: {
        type: 'number',
        locale: 'pt-BR',
        sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
      },
    },
  });

describe('Compilation reliability regressions', () => {
  it('guides discovery with a flat contract while rejecting invalid actions', async () => {
    const plan = pricePlan();
    const input = {
      jobId: 'contract',
      url: 'https://example.com',
      prompt: 'prices',
      evidence: '',
      timeoutMs: 1000,
    };
    let request: ModelInput | undefined;
    let response: unknown = {
      action: { kind: 'wait', condition: { kind: 'network', match: { urlPattern: '*' } } },
    };
    const stages = createModelStages({
      name: 'fixture',
      generate: async (value) => {
        request = value;
        return response;
      },
    });
    await expect(stages.discovery.next(input, plan.intent)).rejects.toThrow();
    expect(request!.instructions).toContain('Use response, never network');
    expect(request!.outputSchema).toHaveProperty('properties.action.anyOf');
    const validAction = {
      kind: 'wait',
      condition: { kind: 'response', match: { urlPattern: '/api/items' } },
    };
    response = { action: validAction };
    await expect(stages.discovery.next(input, plan.intent)).resolves.toEqual(validAction);
    response = { action: { kind: 'wait', condition: { kind: 'visible' } } };
    await expect(stages.discovery.next(input, plan.intent)).rejects.toThrow();
    response = { action: { kind: 'wait', condition: { kind: 'field', field: 'price' } } };
    await expect(stages.discovery.next(input, plan.intent)).rejects.toThrow();
  });

  it('offers field conditions for extracted data but not discovery or setup waits', () => {
    const field = { kind: 'field', field: 'price' };
    const wait = { kind: 'wait', condition: field };
    expect(modelDiscoverySchema.safeParse({ action: wait }).success).toBe(false);
    expect(modelStrategySchema.safeParse({ ...pricePlan().strategy, setup: [wait] }).success).toBe(
      false
    );
    expect(modelStrategySchema.safeParse({ ...pricePlan().strategy, ready: [field] }).success).toBe(
      true
    );
  });

  for (const item of corpus.cases)
    it(item.name, () => {
      const plan = pricePlan();
      plan.strategy.records = item.records;
      plan.strategy.fields.price = [item.source];
      const result = extractor.extract(
        {
          html: item.html,
          url: 'https://example.com',
          httpStatus: item.httpStatus ?? 200,
          responses: [],
        },
        plan
      );
      expect(result.quality).toBe(item.quality);
      if (item.price !== undefined) expect(result.records[0]?.price).toBe(item.price);
      if (item.quality === 'INVALID') {
        expect(result.issues.join(' ')).toContain('Failed sources:');
        expect(result.issues.join(' ')).toContain(JSON.stringify(item.source));
      }
    });

  it('redacts credentials from failed value samples', () => {
    const result = extractor.extract(
      {
        html: '<main><b class="price">https://example.com/?token=private-value</b></main>',
        url: 'https://example.com',
        httpStatus: 200,
        responses: [],
      },
      pricePlan()
    );
    expect(result.quality).toBe('INVALID');
    expect(result.issues.join(' ')).toContain('[REDACTED]');
    expect(result.issues.join(' ')).not.toContain('private-value');
  });

  it('offers pagination only for collection scope and rejects it for page scope', async () => {
    const plan = pricePlan();
    const pagination = {
      kind: 'scroll' as const,
      end: [{ kind: 'exists' as const, locator: { kind: 'css' as const, selector: '.end' } }],
    };
    let contract: ModelInput | undefined;
    const model: IModelProvider = {
      name: 'fixture',
      generate: async (input) => {
        contract = input;
        return { ...plan.strategy, pagination };
      },
    };
    const stages = createModelStages(model);
    const input = {
      jobId: 'scope',
      url: 'https://example.com',
      prompt: 'prices',
      evidence: '',
      timeoutMs: 1000,
    };
    await expect(stages.generator.generate(input, plan.intent, '')).rejects.toThrow();
    expect(contract!.outputSchema).not.toHaveProperty('properties.pagination');
    await expect(
      stages.generator.generate(
        input,
        { ...plan.intent, mode: 'collection', scope: 'collection' },
        ''
      )
    ).resolves.toHaveProperty('pagination');
    expect(contract!.outputSchema).toHaveProperty('properties.pagination');
  });

  for (const repeat of [false, true])
    it(
      repeat
        ? 'stops replaying an unchanged rejected strategy'
        : 'repairs a failed source using observed validation feedback',
      async () => {
        const plan = pricePlan();
        const bad = {
          ...plan.strategy,
          fields: { price: [{ kind: 'dom' as const, selector: '.missing', attribute: 'text' }] },
        };
        const snapshot = {
          html: '<main><b class="price">R$ 944,10</b></main>',
          url: 'https://example.com',
          httpStatus: 200,
          responses: [],
        };
        const feedback: string[] = [];
        const model: IModelProvider = {
          name: 'fixture',
          generate: async (input) => {
            if (input.task === 'discovery') return { action: null };
            if (input.task === 'plan') {
              feedback.push(JSON.parse(input.evidence).context.validationFeedback);
              return feedback.length === 1 || repeat ? bad : plan.strategy;
            }
            throw new Error('Unexpected model task');
          },
        };
        const adapter: DocumentAdapter = {
          open: async () => ({
            snapshot: async () => snapshot,
            check: async () => undefined,
            advance: async () => {},
            discover: async () => snapshot,
            screenshot: async () => undefined,
            close: async () => {},
          }),
        };
        let executions = 0;
        const executor = new ExtractionExecutor(
          { http: adapter, browser: adapter },
          extractor,
          fixturePolicy
        );
        const pipeline = new ConfigurationPipeline(
          createModelStages(model),
          adapter,
          {
            execute: async (...args) => {
              executions++;
              return executor.execute(...args);
            },
          },
          {
            budgetMs: 5000,
            maxAttempts: 3,
            maxDiscoveryActions: 2,
            evidenceLimit: 5000,
            semanticEnabled: false,
            semanticThreshold: 4,
          }
        );
        const result = pipeline.configure({
          jobId: 'repair',
          url: snapshot.url,
          prompt: 'Current price',
          intent: plan.intent,
        });
        if (repeat) {
          await expect(result).rejects.toThrow('Repeated rejected extraction strategy');
          expect(executions).toBe(1);
        } else
          await expect(result).resolves.toMatchObject({ execution: { data: { price: 944.1 } } });
        expect(feedback).toHaveLength(2);
        expect(feedback[1]).toContain('.missing');
        expect(feedback[1]).toContain('raw');
      }
    );
});
