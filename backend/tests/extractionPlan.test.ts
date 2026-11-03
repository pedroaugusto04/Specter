import { describe, it, expect } from 'vitest';
import { extractionPlanSchema } from '../src/types/extractionPlan.js';
import { extractPlanPage } from '../src/utils/planExtraction.js';
import { PlanExecutionService } from '../src/services/planExecutionService.js';
import { evaluateTriggerRules } from '../src/utils/triggerEvaluator.js';

const plan = extractionPlanSchema.parse({
  version: 2,
  mode: 'collection',
  containerSelector: 'article',
  readySelector: 'main',
  emptySelector: '.empty',
  fields: {
    id: { sources: [{ kind: 'dom', selector: ':scope', attribute: 'data-id' }], type: 'string' },
    price: {
      sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
      type: 'number',
      locale: 'en-US',
    },
    available: {
      sources: [{ kind: 'dom', selector: '.stock', attribute: 'text' }],
      type: 'boolean',
      booleanValues: { available: true, unavailable: false },
    },
  },
  identityFields: ['id'],
});
const row = (id: string, price = '100', stock = 'Available') =>
  `<article data-id="${id}"><b class="price">${price}</b><span class="stock">${stock}</span></article>`;

describe('Validated extraction plans', () => {
  it('extracts and normalizes all records without sample truncation', () => {
    const result = extractPlanPage(
      `<main>${['e', 'd', 'c', 'b', 'a'].map((id) => row(id)).join('')}</main>`,
      'https://example.com',
      plan
    );
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toMatchObject({
      count: 5,
      items: [{ id: 'a', price: 100, available: true }, {}, {}, {}, {}],
    });
  });
  it('rejects missing required data, unknown booleans and duplicate identities', () => {
    for (const html of [row('a', 'none'), row('a', '100', 'Unknown'), row('a') + row('a')]) {
      expect(
        extractPlanPage(`<main>${html}</main>`, 'https://example.com', plan).report.quality
      ).toBe('INVALID');
    }
  });
  it('distinguishes confirmed empty from missing readiness and missing records', () => {
    expect(
      extractPlanPage('<main><p class="empty">No records</p></main>', 'https://example.com', plan)
        .report.quality
    ).toBe('EMPTY');
    expect(extractPlanPage('<main></main>', 'https://example.com', plan).report.quality).toBe(
      'INCONCLUSIVE'
    );
    expect(
      extractPlanPage('<div class="empty"></div>', 'https://example.com', plan).report.quality
    ).toBe('INCONCLUSIVE');
  });
  it('requires identity, explicit numeric locale and required trigger references', () => {
    expect(extractionPlanSchema.safeParse({ ...plan, identityFields: [] }).success).toBe(false);
    expect(
      extractionPlanSchema.safeParse({
        ...plan,
        triggerRules: [{ field: 'missing', operator: 'eq', value: 1 }],
      }).success
    ).toBe(false);
  });
  it('does not combine conditions across different records', () => {
    const result = evaluateTriggerRules(
      {
        items: [
          { id: 'a', price: 50, available: false },
          { id: 'b', price: 200, available: true },
        ],
        count: 2,
      },
      [
        { field: 'price', operator: 'lt', value: 100 },
        { field: 'available', operator: 'eq', value: true },
      ],
      'all',
      null,
      ['id']
    );
    expect(result.triggered).toBe(false);
  });
  it('does not interpret missing values as satisfying negative conditions', () => {
    expect(
      evaluateTriggerRules({ available: null }, [
        { field: 'available', operator: 'neq', value: true },
      ]).triggered
    ).toBe(false);
  });
  it('follows same-origin pagination and requires positive completion evidence', async () => {
    const executor = new PlanExecutionService({
      name: 'fixture',
      async fetchHtml(url) {
        return {
          url,
          rawHtml: url.endsWith('/2')
            ? `<main>${row('b')}<i class="end"></i></main>`
            : `<main>${row('a')}<a class="next" href="/2">Next</a></main>`,
          durationMs: 1,
          httpStatus: 200,
        };
      },
    });
    const result = await executor.execute('https://example.com', {
      ...plan,
      scope: 'collection',
      pagination: { kind: 'link', nextSelector: '.next', endSelector: '.end' },
    });
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toMatchObject({ count: 2 });
    const looping = new PlanExecutionService({
      name: 'fixture',
      async fetchHtml(url) {
        return {
          url,
          rawHtml: `<main>${row('a')}<a class="next" href="/">Next</a></main>`,
          durationMs: 1,
          httpStatus: 200,
        };
      },
    });
    expect(
      (
        await looping.execute('https://example.com/', {
          ...plan,
          scope: 'collection',
          pagination: { kind: 'link', nextSelector: '.next', endSelector: '.end' },
        })
      ).report.quality
    ).toBe('PARTIAL');
  });
});

describe('Generic field semantics', () => {
  it('does not collapse different textual identifiers containing the same number', () => {
    expect(
      evaluateTriggerRules({ code: 'A2' }, [{ field: 'code', operator: 'eq', value: 'B2' }])
        .triggered
    ).toBe(false);
  });
  it('keeps structured-data entities separate', () => {
    const structuredPlan = extractionPlanSchema.parse({
      version: 2,
      mode: 'collection',
      jsonLdType: 'Thing',
      readySelector: 'main',
      identityFields: ['id'],
      fields: {
        id: { type: 'string', sources: [{ kind: 'jsonld', path: ['identifier'] }] },
        label: { type: 'string', sources: [{ kind: 'jsonld', path: ['name'] }] },
      },
    });
    const result = extractPlanPage(
      '<main></main><script type="application/ld+json">[{"@type":"Thing","identifier":"a","name":"First"},{"@type":"Thing","identifier":"b","name":"Second"}]</script>',
      'https://example.com',
      structuredPlan
    );
    expect(result.data).toEqual({
      items: [
        { id: 'a', label: 'First' },
        { id: 'b', label: 'Second' },
      ],
      count: 2,
    });
  });
});

describe('Ambiguous structured data', () => {
  it('selects the only JSON-LD entity that contains all requested fields', () => {
    const plan = extractionPlanSchema.parse({
      version: 2,
      mode: 'single',
      readySelector: 'main',
      fields: {
        name: { type: 'string', sources: [{ kind: 'jsonld', path: ['name'] }] },
        price: {
          type: 'number',
          locale: 'en-US',
          sources: [{ kind: 'jsonld', path: ['offers', 'price'] }],
        },
      },
    });
    const result = extractPlanPage(
      '<main></main><script type="application/ld+json">[{"@type":"Organization","name":"Store"},{"@type":"Product","name":"Chair","offers":{"price":"19.99"}}]</script>',
      'https://example.com',
      plan
    );
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toEqual({ name: 'Chair', price: 19.99 });
  });
});
