import { ExtractionExecutor } from '../src/extraction/executor.js';
import type { DocumentAdapter } from '../src/extraction/contracts.js';
import { standardSourceReaders } from '../src/extraction/sources.js';
import { describe, it, expect } from 'vitest';
import { extractionPlanSchema, normalizeExtractionCandidate } from '../src/types/extractionPlan.js';
import { PageExtractor } from '../src/extraction/pageExtractor.js';
import { convertFieldValue } from '../src/extraction/values.js';
import { matchesRecord } from '../src/extraction/recordFilter.js';
import { evaluateTriggerRules } from '../src/utils/triggerEvaluator.js';
import { fixtureExecutor, fixturePlan, fixturePolicy } from './helpers/extractionFixtures.js';

const row = (id: string, price = '100') =>
  '<article data-id="' + id + '"><b class="price">' + price + '</b></article>';
const plan = fixturePlan({
  mode: 'collection',
  containerSelector: 'article',
  readySelector: 'main',
  emptySelector: '.empty',
  identityFields: ['id'],
  fields: {
    id: { type: 'string', sources: [{ kind: 'dom', selector: ':scope', attribute: 'data-id' }] },
    price: {
      type: 'number',
      locale: 'en-US',
      sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
    },
  },
});
const extract = (html: string, input = plan) =>
  new PageExtractor(standardSourceReaders()).extract(
    { html, url: 'https://example.com', httpStatus: 200, responses: [] },
    input
  );
describe('Extraction contract and integrity', () => {
  it('captures final records after live terminal checks', async () => {
    const input = structuredClone(plan);
    input.intent.scope = 'collection';
    input.strategy.pagination = {
      kind: 'scroll',
      end: [{ kind: 'exists', locator: { kind: 'css', selector: '.end' } }],
    };
    let html = '<main>' + row('a') + '</main>';
    const adapter: DocumentAdapter = {
      open: async () => ({
        snapshot: async () => ({
          html,
          url: 'https://example.com',
          httpStatus: 200,
          responses: [],
        }),
        check: async (condition) => {
          if (
            'locator' in condition &&
            condition.locator.kind === 'css' &&
            condition.locator.selector === '.end'
          ) {
            html = '<main>' + row('b') + '<i class="end"></i></main>';
            return true;
          }
          return undefined;
        },
        discover: async () => {
          throw new Error('Unexpected discovery');
        },
        advance: async () => {
          throw new Error('Unexpected pagination');
        },
        screenshot: async () => undefined,
        close: async () => {},
      }),
    };
    const executor = new ExtractionExecutor(
      { http: adapter, browser: adapter },
      new PageExtractor(standardSourceReaders()),
      fixturePolicy
    );
    const result = await executor.execute('https://example.com', input);
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toMatchObject({ count: 1, items: [{ id: 'b' }] });
  });

  it('extracts all records and captures provenance', () => {
    const result = extract(
      '<main>' + ['e', 'd', 'c', 'b', 'a'].map((id) => row(id)).join('') + '</main>'
    );
    expect(result.quality).toBe('COMPLETE');
    expect(result.records).toHaveLength(5);
    expect(result.sourcesUsed['price#0']).toBe(5);
    expect(result.evidence[0]).toMatchObject({ field: 'id', value: 'e', raw: 'e' });
  });
  it('rejects missing data and duplicate identities', () => {
    expect(extract('<main>' + row('a', 'none') + '</main>').quality).toBe('INVALID');
    expect(extract('<main>' + row('a') + row('a') + '</main>').quality).toBe('INVALID');
  });
  it('accepts duplicate DOM matches when all non-empty values are identical and rejects distinct values', () => {
    const singlePlan = fixturePlan({
      mode: 'single',
      containerSelector: 'main',
      readySelector: 'main',
      fields: {
        price: {
          type: 'number',
          locale: 'pt-BR',
          sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
        },
      },
    });
    const identical = extract(
      '<main><span class="price">R$ 4.549,00</span><span class="price">R$ 4.549,00</span></main>',
      singlePlan
    );
    expect(identical.quality).toBe('COMPLETE');
    expect(identical.records).toEqual([{ price: 4549 }]);

    const conflicting = extract(
      '<main><span class="price">R$ 4.549,00</span><span class="price">R$ 329,00</span></main>',
      singlePlan
    );
    expect(conflicting.quality).toBe('INVALID');
    expect(conflicting.issues.join(' ')).toContain('Ambiguous DOM field source');

    const fallbackPlan = structuredClone(singlePlan);
    fallbackPlan.strategy.fields.price = [
      { kind: 'dom', selector: '.price', attribute: 'text' },
      { kind: 'dom', selector: '.final-price', attribute: 'text' },
    ];
    const resolvedByFallback = extract(
      '<main><span class="price">R$ 4.549,00</span><span class="price">R$ 329,00</span><b class="final-price">R$ 4.549,00</b></main>',
      fallbackPlan
    );
    expect(resolvedByFallback.quality).toBe('COMPLETE');
    expect(resolvedByFallback.records).toEqual([{ price: 4549 }]);
  });
  it('requires explicit empty and readiness evidence', () => {
    expect(extract('<main><p class="empty">No records</p></main>').quality).toBe('EMPTY');
    expect(extract('<main></main>').quality).toBe('INCONCLUSIVE');
    expect(extract('<p class="empty">No records</p>').quality).toBe('INCONCLUSIVE');
  });
  it('validates intent references and adapter capabilities', () => {
    expect(
      extractionPlanSchema.safeParse({ ...plan, intent: { ...plan.intent, identityFields: [] } })
        .success
    ).toBe(false);
    expect(
      extractionPlanSchema.safeParse({
        ...plan,
        intent: { ...plan.intent, triggerRules: [{ field: 'missing', operator: 'eq', value: 1 }] },
      }).success
    ).toBe(false);
    expect(
      extractionPlanSchema.safeParse({
        ...plan,
        strategy: {
          ...plan.strategy,
          ready: [{ kind: 'visible', locator: { kind: 'css', selector: 'main' } }],
        },
      }).success
    ).toBe(false);
    expect(extractionPlanSchema.safeParse({ version: 2 }).success).toBe(false);
  });
  it('does not silently turn two prices into one number or guess grouping', () => {
    const field = plan.intent.fields.price!;
    expect(convertFieldValue('$ 1,299.99', field, 'https://example.com')).toBe(1299.99);
    expect(convertFieldValue('$100 / $200', field, 'https://example.com')).toBeNull();
    expect(convertFieldValue('1,29', field, 'https://example.com')).toBeNull();
    expect(
      convertFieldValue('1.299,99', { ...field, locale: 'pt-BR' }, 'https://example.com')
    ).toBe(1299.99);
    expect(
      convertFieldValue('2789.10', { ...field, locale: 'pt-BR' }, 'https://example.com')
    ).toBe(2789.1);
    expect(
      convertFieldValue('42', { ...field, locale: undefined }, 'https://example.com')
    ).toBe(42);
    expect(convertFieldValue('US$ 49.99', field, 'https://example.com')).toBe(49.99);
    expect(convertFieldValue('CA$ 1,299.99', field, 'https://example.com')).toBe(1299.99);
    expect(
      convertFieldValue('(10) / (20)', { ...field, locale: 'pt-BR' }, 'https://example.com')
    ).toBeNull();
    expect(
      convertFieldValue('Clientes (0)', { ...field, locale: 'pt-BR' }, 'https://example.com')
    ).toBeNull();
    expect(convertFieldValue('Total: 45', field, 'https://example.com')).toBeNull();
    expect(
      convertFieldValue('Clientes ativos: 15', { ...field, locale: 'pt-BR' }, 'https://example.com')
    ).toBeNull();

    const boolField = {
      type: 'boolean' as const,
      description: 'in stock',
      required: true,
      booleanValues: { 'em estoque': true, esgotado: false },
    };
    expect(convertFieldValue(true, boolField, 'https://example.com')).toBe(true);
    expect(convertFieldValue(false, boolField, 'https://example.com')).toBe(false);
    expect(convertFieldValue('Em Estoque', boolField, 'https://example.com')).toBe(true);
    expect(convertFieldValue('esgotado', boolField, 'https://example.com')).toBe(false);
    expect(convertFieldValue('true', boolField, 'https://example.com')).toBe(true);
    expect(convertFieldValue('false', boolField, 'https://example.com')).toBe(false);
    expect(convertFieldValue('1', boolField, 'https://example.com')).toBe(true);
    expect(convertFieldValue('0', boolField, 'https://example.com')).toBe(false);
    expect(convertFieldValue('talvez', boolField, 'https://example.com')).toBeNull();
  });
  it('honors non-Western grouping, digit scripts and space separators', () => {
    const field = plan.intent.fields.price!;
    expect(
      convertFieldValue('\u20b9 1,23,456.78', { ...field, locale: 'hi-IN' }, 'https://example.com')
    ).toBe(123456.78);
    expect(
      convertFieldValue(
        '\u0661\u066c\u0662\u0663\u0664\u066b\u0665\u0666',
        { ...field, locale: 'ar-EG' },
        'https://example.com'
      )
    ).toBe(1234.56);
    expect(
      convertFieldValue(
        '1\u202f234,56 \u20ac',
        { ...field, locale: 'fr-FR' },
        'https://example.com'
      )
    ).toBe(1234.56);
    expect(convertFieldValue('(1,234.56)', field, 'https://example.com')).toBeNull();
  });
  it('converts ISO and regional dates based on locale', () => {
    const dateField = { type: 'date' as const, description: 'created_at', required: true };
    expect(convertFieldValue('2024-05-10', dateField, 'https://example.com')).toBe(
      '2024-05-10T00:00:00.000Z'
    );
    expect(convertFieldValue('2024-05-10T12:00:00Z', dateField, 'https://example.com')).toBe(
      '2024-05-10T12:00:00.000Z'
    );
    expect(
      convertFieldValue('09/11/2024', { ...dateField, locale: 'pt-BR' }, 'https://example.com')
    ).toBe('2024-11-09T00:00:00.000Z');
    expect(
      convertFieldValue('11/09/2024', { ...dateField, locale: 'en-US' }, 'https://example.com')
    ).toBe('2024-11-09T00:00:00.000Z');
    expect(convertFieldValue('25/12/2024', dateField, 'https://example.com')).toBe(
      '2024-12-25T00:00:00.000Z'
    );
    expect(convertFieldValue('invalid date', dateField, 'https://example.com')).toBeNull();
    expect(convertFieldValue('31/02/2024', dateField, 'https://example.com')).toBeNull();
  });
  it('extracts tokens from mixed DOM text using optional pattern regex with capture group', () => {
    const input = fixturePlan({
      mode: 'single',
      fields: {
        count: {
          type: 'number',
          sources: [
            {
              kind: 'dom',
              selector: '.badge',
              attribute: 'text',
              pattern: '\\((\\d+)\\)',
            },
          ],
        },
        active: {
          type: 'number',
          sources: [
            {
              kind: 'dom',
              selector: '.status',
              attribute: 'text',
              pattern: 'Ativos:\\s*(\\d+)',
            },
          ],
        },
      },
    });
    const result = extract(
      '<div class="badge">Clientes (42)</div><div class="status">Status: Ativos: 99</div>',
      input
    );
    expect(result.records[0]).toEqual({ count: 42, active: 99 });
  });
  it('evaluates contains and not_contains filters case-insensitively', () => {
    expect(
      matchesRecord({ status: 'EM ESTOQUE' }, [
        { field: 'status', operator: 'contains', value: 'em estoque' },
      ])
    ).toBe(true);
    expect(
      matchesRecord({ status: 'Disponível' }, [
        { field: 'status', operator: 'not_contains', value: 'indisponível' },
      ])
    ).toBe(true);
    expect(
      matchesRecord({ status: 'Esgotado' }, [
        { field: 'status', operator: 'contains', value: 'em estoque' },
      ])
    ).toBe(false);
  });
  it('keeps graph/list entities distinct and recognizes Schema.org URLs', () => {
    const structured = fixturePlan({
      mode: 'collection',
      jsonLdType: 'Thing',
      identityFields: ['id'],
      fields: {
        id: { type: 'string', sources: [{ kind: 'jsonld', path: ['identifier'] }] },
        label: { type: 'string', sources: [{ kind: 'jsonld', path: ['name'] }] },
      },
    });
    const result = extract(
      '<script type="application/ld+json">{"@graph":[{"@type":"ItemList","itemListElement":[{"@type":"https://schema.org/Thing","identifier":"a","name":"First"},{"@type":"ListItem","item":{"@type":"Thing","identifier":"b","name":"Second"}}]}]}</script>',
      structured
    );
    expect(result.records).toEqual([
      { id: 'a', label: 'First' },
      { id: 'b', label: 'Second' },
    ]);
  });
  it('associates JSON-LD to DOM by key and rejects missing or duplicate matches', () => {
    const joined = structuredClone(plan);
    joined.strategy.associations = {
      product: {
        localField: 'id',
        foreignPath: ['identifier'],
        records: { kind: 'jsonld', type: 'Product' },
      },
    };
    joined.strategy.fields.price = [
      { kind: 'jsonld', path: ['offers', 'price'], association: 'product' },
    ];
    expect(extractionPlanSchema.safeParse(joined).success).toBe(true);
    const entity = { '@type': 'Product', identifier: 'a', offers: { price: '123' } };
    const html = (entities: unknown[]) =>
      '<main><article data-id="a"></article></main><script type="application/ld+json">' +
      JSON.stringify(entities) +
      '</script>';
    expect(extract(html([entity]), joined).records).toEqual([{ id: 'a', price: 123 }]);
    expect(extract(html([entity, entity]), joined).quality).toBe('INVALID');
    expect(extract(html([]), joined).quality).toBe('INVALID');
  });
  it('rejects mixed collection sources without a join', () => {
    const mixed = {
      ...plan,
      strategy: {
        ...plan.strategy,
        fields: { ...plan.strategy.fields, price: [{ kind: 'jsonld', path: ['price'] }] },
      },
    };
    expect(extractionPlanSchema.safeParse(mixed).success).toBe(false);
  });
  it('auto-promotes transport to browser when network response records or ready conditions are used', () => {
    const responsePlan = {
      intent: {
        entity: 'active_clients',
        mode: 'single',
        scope: 'page',
        fields: {
          clients_count: {
            description: 'Count of active clients',
            type: 'number',
            required: true,
            locale: 'pt-BR',
          },
        },
        identityFields: [],
        filters: [],
        triggerRules: [],
        triggerMatchMode: 'all',
      },
      strategy: {
        transport: 'http',
        records: {
          kind: 'response',
          match: { urlPattern: 'https://example.com/api/overview', method: 'GET' },
          path: ['data'],
        },
        fields: {
          clients_count: [{ kind: 'response', path: ['count'] }],
        },
        ready: [
          {
            kind: 'response',
            match: { urlPattern: 'https://example.com/api/overview', method: 'GET' },
            path: ['success'],
            equals: true,
          },
        ],
        empty: [],
      },
    };
    // Direct safeParse without normalization fails validation with actionable error
    const directResult = extractionPlanSchema.safeParse(responsePlan);
    expect(directResult.success).toBe(false);
    if (!directResult.success) {
      expect(directResult.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['strategy', 'transport'],
          message: expect.stringContaining('The selected strategy requires browser capabilities'),
        })
      );
    }

    // Normalizing candidate promotes transport to browser and passes schema parsing
    const normalized = normalizeExtractionCandidate(responsePlan);
    const parsed = extractionPlanSchema.parse(normalized);
    expect(parsed.strategy.transport).toBe('browser');
  });
  it('auto-promotes transport to browser when setup interactions are used', () => {
    const interactivePlan = {
      intent: {
        entity: 'active_clients',
        mode: 'single',
        scope: 'page',
        fields: {
          clients_count: {
            description: 'Count of active clients',
            type: 'number',
            required: true,
            locale: 'pt-BR',
          },
        },
        identityFields: [],
        filters: [],
        triggerRules: [],
        triggerMatchMode: 'all',
      },
      strategy: {
        transport: 'http',
        setup: [{ kind: 'click', locator: { kind: 'css', selector: 'button.clients' } }],
        records: { kind: 'dom', selector: 'body' },
        fields: {
          clients_count: [{ kind: 'dom', selector: '.clients-count', attribute: 'text' }],
        },
        ready: [{ kind: 'exists', locator: { kind: 'css', selector: '.clients-count' } }],
        empty: [],
      },
    };
    const normalized = normalizeExtractionCandidate(interactivePlan);
    const parsed = extractionPlanSchema.parse(normalized);
    expect(parsed.strategy.transport).toBe('browser');
  });
  it('preserves http transport when strategy has no browser-specific requirements', () => {
    const parsed = extractionPlanSchema.parse(plan);
    expect(parsed.strategy.transport).toBe('http');
  });
  it('auto-reconciles collection scope and mode when pagination is configured with page scope', () => {
    const sigaaCandidate = {
      intent: {
        entity: 'latest_update',
        mode: 'collection',
        scope: 'page',
        fields: {
          date: {
            displayName: 'Data',
            observedLabel: '28/10/2026 -',
            description: 'Data da atualização',
            type: 'string',
            required: true,
          },
          course: {
            displayName: 'Curso',
            observedLabel: 'INTRODUÇÃO À SOCIOLOGIA (2026.2)',
            description: 'Nome da turma ou disciplina associada à atualização',
            type: 'string',
            required: true,
          },
          description: {
            displayName: 'Descrição',
            observedLabel: 'Nova Notícia: Ausência em aula do dia 29/10/2026',
            description: 'Conteúdo ou descrição da atualização',
            type: 'string',
            required: true,
          },
        },
        identityFields: ['date', 'course', 'description'],
        filters: [],
        triggerRules: [],
        triggerMatchMode: 'all',
      },
      strategy: {
        transport: 'browser',
        records: { kind: 'dom', selector: '#atualizacoes-turma .rotator table' },
        fields: {
          date: [
            {
              kind: 'dom',
              selector: 'tr:nth-child(1) td',
              attribute: 'text',
              pattern: '(\\d{2}/\\d{2}/\\d{4})',
            },
          ],
          course: [{ kind: 'dom', selector: 'tr:nth-child(1) td a', attribute: 'text' }],
          description: [{ kind: 'dom', selector: 'tr:nth-child(2) td', attribute: 'text' }],
        },
        ready: [{ kind: 'exists', locator: { kind: 'css', selector: '#atualizacoes-turma' } }],
        empty: [],
        pagination: {
          kind: 'scroll',
          end: [{ kind: 'exists', locator: { kind: 'css', selector: '#atualizacoes-turma' } }],
        },
      },
    };
    const normalized = normalizeExtractionCandidate(sigaaCandidate);
    const parsed = extractionPlanSchema.parse(normalized);
    expect(parsed.intent.scope).toBe('collection');
    expect(parsed.intent.mode).toBe('collection');
    expect(parsed.strategy.pagination?.kind).toBe('scroll');
  });
  it('auto-reconciles scope to page when collection scope is declared without pagination', () => {
    const unpaginatedCollection = {
      intent: {
        entity: 'items',
        mode: 'collection',
        scope: 'collection',
        fields: {
          title: {
            displayName: 'Title',
            observedLabel: 'Item 1',
            description: 'Item title',
            type: 'string',
            required: true,
          },
        },
        identityFields: ['title'],
        filters: [],
        triggerRules: [],
        triggerMatchMode: 'all',
      },
      strategy: {
        transport: 'http',
        records: { kind: 'dom', selector: '.item' },
        fields: {
          title: [{ kind: 'dom', selector: 'h2', attribute: 'text' }],
        },
        ready: [{ kind: 'exists', locator: { kind: 'css', selector: '.item' } }],
        empty: [],
      },
    };
    const normalized = normalizeExtractionCandidate(unpaginatedCollection);
    const parsed = extractionPlanSchema.parse(normalized);
    expect(parsed.intent.scope).toBe('page');
  });
  it('allows intent without scope or filters, defaulting them cleanly', () => {
    const minimalPlan = {
      intent: {
        entity: 'product',
        mode: 'single',
        fields: {
          price: {
            description: 'Product price',
            type: 'number',
            required: true,
          },
        },
      },
      strategy: {
        transport: 'http',
        records: { kind: 'dom', selector: '.product' },
        fields: {
          price: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
        },
      },
    };
    const normalized = normalizeExtractionCandidate(minimalPlan);
    const parsed = extractionPlanSchema.parse(normalized);
    expect(parsed.intent.scope).toBe('page');
    expect(parsed.intent.filters).toEqual([]);
    expect(parsed.intent.fields.price?.locale).toBe('pt-BR');
    expect(parsed.strategy.ready.length).toBeGreaterThanOrEqual(1);
  });
});
describe('Common execution and comparisons', () => {
  it('follows same-origin links and verifies completion', async () => {
    const executor = fixtureExecutor({
      name: 'fixture',
      fetchHtml: async (url) => ({
        url,
        httpStatus: 200,
        durationMs: 1,
        rawHtml:
          '<main>' +
          row(url.endsWith('/2') ? 'b' : 'a') +
          (url.endsWith('/2') ? '<i class="end"></i>' : '<a class="next" href="/2">Next</a>') +
          '</main>',
      }),
    });
    const result = await executor.execute('https://example.com/', {
      ...plan,
      intent: { ...plan.intent, scope: 'collection' },
      strategy: {
        ...plan.strategy,
        pagination: {
          kind: 'link',
          next: { kind: 'css', selector: '.next' },
          end: [{ kind: 'exists', locator: { kind: 'css', selector: '.end' } }],
        },
      },
    });
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toMatchObject({ count: 2 });
  });
  it('tracks progression through pages whose records do not pass filters', async () => {
    const executor = fixtureExecutor({
      name: 'fixture',
      fetchHtml: async (url) => ({
        url,
        httpStatus: 200,
        durationMs: 1,
        rawHtml:
          '<main>' +
          row(url.endsWith('/2') ? 'b' : 'a', url.endsWith('/2') ? '50' : '200') +
          (url.endsWith('/2') ? '<i class="end"></i>' : '<a class="next" href="/2">Next</a>') +
          '</main>',
      }),
    });
    const result = await executor.execute('https://example.com/', {
      ...plan,
      intent: { ...plan.intent, scope: 'collection', filters: ['price below 100'] },
      strategy: {
        ...plan.strategy,
        filters: [{ field: 'price', operator: 'lt', value: 100 }],
        pagination: {
          kind: 'link',
          next: { kind: 'css', selector: '.next' },
          end: [{ kind: 'exists', locator: { kind: 'css', selector: '.end' } }],
        },
      },
    });
    expect(result.report.quality).toBe('COMPLETE');
    expect(result.data).toMatchObject({ count: 1, items: [{ id: 'b', price: 50 }] });
    expect(result.report.validatedSourceRecords).toBe(2);
  });
  it('cancels before acquisition when the caller has aborted', async () => {
    let fetched = false;
    const executor = fixtureExecutor({
      name: 'fixture',
      fetchHtml: async (url) => {
        fetched = true;
        return { url, httpStatus: 200, durationMs: 1, rawHtml: '<main>' + row('a') + '</main>' };
      },
    });
    await expect(
      executor.execute('https://example.com', plan, {
        signal: AbortSignal.abort(new Error('Cancelled')),
      })
    ).rejects.toThrow('Cancelled');
    expect(fetched).toBe(false);
  });
  it('never accepts an upstream error page with type-correct fields', async () => {
    const executor = fixtureExecutor({
      name: 'fixture',
      fetchHtml: async (url) => ({
        url,
        httpStatus: 500,
        durationMs: 1,
        rawHtml: '<main>' + row('a') + '</main>',
      }),
    });
    await expect(executor.execute('https://example.com', plan)).rejects.toThrow('HTTP 500');
  });
  it('rejects a first response redirected to another origin', async () => {
    const executor = fixtureExecutor({
      name: 'fixture',
      fetchHtml: async () => ({
        url: 'https://other.example/',
        rawHtml: '<main>' + row('a') + '</main>',
        httpStatus: 200,
        durationMs: 1,
      }),
    });
    await expect(executor.execute('https://example.com', plan)).rejects.toThrow('original origin');
  });
  it('combines conditions within the same entity', () => {
    expect(
      evaluateTriggerRules(
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
      ).triggered
    ).toBe(false);
    expect(
      evaluateTriggerRules({ code: 'A2' }, [{ field: 'code', operator: 'eq', value: 'B2' }])
        .triggered
    ).toBe(false);
  });
});
