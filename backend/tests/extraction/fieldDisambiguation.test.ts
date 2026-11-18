import { describe, it, expect } from 'vitest';
import { precheckCandidatePlanInSnapshot } from '../../src/extraction/configurationHelpers.js';
import { PageExtractor } from '../../src/extraction/pageExtractor.js';
import { standardSourceReaders } from '../../src/extraction/sources.js';
import { evaluateTriggerRules } from '../../src/utils/triggerEvaluator.js';
import { fixturePlan } from '../helpers/extractionFixtures.js';
import type { DocumentSnapshot } from '../../src/extraction/contracts.js';
import { TriggerOperator, TriggerMatchMode } from '../../src/extraction/constants.js';

describe('Field Disambiguation and Semantic Decomposition', () => {
  const snapshot: DocumentSnapshot = {
    html: `
      <html>
        <body>
          <main>
            <div class="product-card" data-id="item-1">
              <h2 class="title">Teclado Mecânico RGB</h2>
              <div class="prices">
                <span class="price pix">R$ 299,90 à vista no Pix</span>
                <span class="price card">R$ 349,90 no cartão</span>
                <span class="price installments">10x de R$ 34,99 sem juros</span>
              </div>
            </div>
          </main>
        </body>
      </html>
    `,
    url: 'https://example.com/item/1',
    httpStatus: 200,
    responses: [],
  };

  describe('precheckCandidatePlanInSnapshot', () => {
    it('rejects candidate plan when a field selector matches multiple elements with distinct values without pattern', () => {
      const plan = fixturePlan({
        mode: 'single',
        containerSelector: '.product-card',
        fields: {
          price: {
            type: 'number',
            locale: 'pt-BR',
            sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
          },
        },
      });

      const result = precheckCandidatePlanInSnapshot(plan, snapshot);
      expect(result.valid).toBe(false);
      expect(result.rejection).toContain('Ambiguous DOM field source');
      expect(result.rejection).toContain("field 'price' selector '.price' matched 3 elements with 3 distinct values");
      expect(result.rejection).toContain('Narrow the selector or provide a pattern');
    });

    it('accepts candidate plan when selector is scoped to an unambiguous element', () => {
      const plan = fixturePlan({
        mode: 'single',
        containerSelector: '.product-card',
        fields: {
          price: {
            type: 'number',
            locale: 'pt-BR',
            sources: [{ kind: 'dom', selector: '.price.pix', attribute: 'text' }],
          },
        },
      });

      const result = precheckCandidatePlanInSnapshot(plan, snapshot);
      expect(result.valid).toBe(true);
      expect(result.rejection).toBeUndefined();
    });

    it('accepts candidate plan when generic selector provides a pattern to isolate value', () => {
      const plan = fixturePlan({
        mode: 'single',
        containerSelector: '.product-card',
        fields: {
          price: {
            type: 'number',
            locale: 'pt-BR',
            sources: [
              {
                kind: 'dom',
                selector: '.price',
                attribute: 'text',
                pattern: '([0-9]+,[0-9]{2}) à vista',
              },
            ],
          },
        },
      });

      const result = precheckCandidatePlanInSnapshot(plan, snapshot);
      expect(result.valid).toBe(true);
      expect(result.rejection).toBeUndefined();
    });

    it('rejects candidate plan when pattern still matches multiple distinct values', () => {
      const plan = fixturePlan({
        mode: 'single',
        containerSelector: '.product-card',
        fields: {
          price: {
            type: 'number',
            locale: 'pt-BR',
            sources: [
              {
                kind: 'dom',
                selector: '.price',
                attribute: 'text',
                pattern: 'R\\$ ([0-9]+,[0-9]{2})',
              },
            ],
          },
        },
      });

      const result = precheckCandidatePlanInSnapshot(plan, snapshot);
      expect(result.valid).toBe(false);
      expect(result.rejection).toContain('Ambiguous DOM field source');
    });

    it('accepts candidate plan when multiple elements have identical text values', () => {
      const duplicateSnapshot: DocumentSnapshot = {
        html: `
          <div class="product-card">
            <span class="tag">Promo</span>
            <span class="tag">Promo</span>
          </div>
        `,
        url: 'https://example.com',
        httpStatus: 200,
        responses: [],
      };

      const plan = fixturePlan({
        mode: 'single',
        containerSelector: '.product-card',
        fields: {
          tag: {
            type: 'string',
            sources: [{ kind: 'dom', selector: '.tag', attribute: 'text' }],
          },
        },
      });

      const result = precheckCandidatePlanInSnapshot(plan, duplicateSnapshot);
      expect(result.valid).toBe(true);
    });
  });

  describe('Extraction execution with Bounded Semantic Decomposition', () => {
    it('extracts canonical base field and decomposed secondary fields deterministically', () => {
      const readers = standardSourceReaders();
      const extractor = new PageExtractor(readers);

      const plan = fixturePlan({
        mode: 'single',
        containerSelector: '.product-card',
        fields: {
          price: {
            type: 'number',
            locale: 'pt-BR',
            sources: [
              {
                kind: 'dom',
                selector: '.price.pix',
                attribute: 'text',
                pattern: '([0-9]+,[0-9]{2})',
              },
            ],
          },
          price_card: {
            type: 'number',
            locale: 'pt-BR',
            sources: [
              {
                kind: 'dom',
                selector: '.price.card',
                attribute: 'text',
                pattern: '([0-9]+,[0-9]{2})',
              },
            ],
          },
          price_installments: {
            type: 'string',
            sources: [{ kind: 'dom', selector: '.price.installments', attribute: 'text' }],
          },
        },
      });

      const extraction = extractor.extract(snapshot, plan);
      expect(extraction.quality).toBe('COMPLETE');
      expect(extraction.records).toHaveLength(1);
      expect(extraction.records[0]).toEqual({
        price: 299.9,
        price_card: 349.9,
        price_installments: '10x de R$ 34,99 sem juros',
      });
    });

    it('allows pattern regex to isolate single distinct value among elements sharing the same class', () => {
      const readers = standardSourceReaders();
      const extractor = new PageExtractor(readers);

      const plan = fixturePlan({
        mode: 'single',
        containerSelector: '.product-card',
        fields: {
          price: {
            type: 'number',
            locale: 'pt-BR',
            sources: [
              {
                kind: 'dom',
                selector: '.price',
                attribute: 'text',
                pattern: '([0-9]+,[0-9]{2}) à vista',
              },
            ],
          },
        },
      });

      const extraction = extractor.extract(snapshot, plan);
      expect(extraction.quality).toBe('COMPLETE');
      expect(extraction.records).toEqual([{ price: 299.9 }]);
    });

    it('correctly evaluates trigger rules on the canonical field when decomposed fields are present', () => {
      const record = {
        price: 299.9,
        price_card: 349.9,
        price_installments: '10x de R$ 34,99 sem juros',
      };

      const rules = [
        {
          field: 'price',
          operator: TriggerOperator.LessThan,
          value: 300,
        },
      ];

      const triggered = evaluateTriggerRules(
        record,
        rules,
        TriggerMatchMode.All,
        { price: 350 }
      );

      expect(triggered.hasRules).toBe(true);
      expect(triggered.triggered).toBe(true);

      const notTriggered = evaluateTriggerRules(
        record,
        [
          {
            field: 'price',
            operator: TriggerOperator.LessThan,
            value: 200,
          },
        ],
        TriggerMatchMode.All,
        { price: 350 }
      );

      expect(notTriggered.hasRules).toBe(true);
      expect(notTriggered.triggered).toBe(false);
    });
  });
});
