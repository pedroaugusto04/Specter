import type { ExecutionStrategy, Source } from '../src/extraction/contracts.js';
import { fixturePlan } from './helpers/extractionFixtures.js';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PageExtractor } from '../src/extraction/pageExtractor.js';
import { standardSourceReaders } from '../src/extraction/sources.js';

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

describe('Extraction reliability regressions', () => {
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
});
