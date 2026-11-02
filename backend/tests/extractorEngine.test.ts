import { describe, expect, it } from 'vitest';
import {
  extractUsingConfig,
  validateExtractionSmokeTest,
} from '../src/utils/extractorEngine.js';

describe('Deterministic Extractor Engine & Pre-Activation Smoke-Test', () => {
  const sampleHtml = `
    <html>
      <head>
        <title id="root-title">Mercado Libre</title>
      </head>
      <body>
        <div id="catalog">
          <article class="product-item" data-id="p-101">
            <h2 class="title">Ergonomic Chair</h2>
            <span class="price">$ 1,250.50</span>
            <a class="details-link" href="/products/chair-101">View details</a>
            <img class="cover" src="https://cdn.example.com/chair.jpg" />
          </article>
          <article class="product-item" data-id="p-102">
            <h2 class="title">Adjustable Standing Desk</h2>
            <span class="price">$ 2,100.00</span>
            <a class="details-link" href="/products/desk-102">View details</a>
            <img class="cover" src="https://cdn.example.com/desk.jpg" />
          </article>
        </div>
      </body>
    </html>
  `;

  it('extracts single-object fields including text, href, src, data-* attributes, and numeric coercion', () => {
    const result = extractUsingConfig(sampleHtml, {
      fields: {
        name: '.product-item .title',
        price: { selector: '.product-item .price', attribute: 'text', type: 'number' },
        url: { selector: '.product-item .details-link', attribute: 'href' },
        image: { selector: '.product-item .cover', attribute: 'src' },
        productId: { selector: '.product-item', attribute: 'data-id' },
      },
    });

    expect(result).toEqual({
      name: 'Ergonomic Chair',
      price: 1250.5,
      url: '/products/chair-101',
      image: 'https://cdn.example.com/chair.jpg',
      productId: 'p-101',
    });
  });

  it('extracts repeating items when containerSelector is configured', () => {
    const result = extractUsingConfig(sampleHtml, {
      containerSelector: 'article.product-item',
      fields: {
        title: { selector: 'h2.title', attribute: 'text' },
        link: { selector: 'a.details-link', attribute: 'href' },
      },
    });

    expect(result).toEqual({
      count: 2,
      items: [
        { title: 'Ergonomic Chair', link: '/products/chair-101' },
        { title: 'Adjustable Standing Desk', link: '/products/desk-102' },
      ],
    });
  });

  it('fails the smoke-test when selectors match no elements on the page', () => {
    const smoke = validateExtractionSmokeTest(sampleHtml, {
      fields: {
        nonExistent: { selector: '#missing-element', attribute: 'text' },
      },
    });

    expect(smoke.valid).toBe(false);
    expect(smoke.reason).toBeDefined();
  });

  it('rejects extractor configurations that only target document <title> or <head> tags', () => {
    const smoke = validateExtractionSmokeTest(sampleHtml, {
      fields: {
        title: { selector: 'title#root-title', attribute: 'text' },
      },
    });

    expect(smoke.valid).toBe(false);
    expect(smoke.reason).toContain('target document <title> or <head> metadata');
  });

  it('coerces non-numeric text to null when field type is number', () => {
    const htmlWithInvalidNumber = `
      <html>
        <body>
          <div class="card">
            <span class="price">Aguarde processando</span>
          </div>
        </body>
      </html>
    `;

    const result = extractUsingConfig(htmlWithInvalidNumber, {
      fields: {
        price: { selector: '.card .price', attribute: 'text', type: 'number' },
      },
    });

    expect(result).toEqual({});
  });

  describe('Fallback Selectors Cascade', () => {
    const htmlSnippet = `
      <html>
        <body>
          <div class="product">
            <p class="label">Starting at</p>
            <p class="font-mono text-2xl font-bold">$2215.00</p>
          </div>
        </body>
      </html>
    `;

    it('uses primary selector when it successfully matches valid content', () => {
      const result = extractUsingConfig(htmlSnippet, {
        fields: {
          price: {
            selector: 'p:contains("Starting at") + p',
            fallbackSelectors: ['.font-mono.text-2xl', '.unknown-selector'],
            attribute: 'text',
            type: 'number',
          },
        },
      });

      expect(result).toEqual({ price: 2215 });
    });

    it('cascades to fallbackSelectors when primary selector is not found in the DOM', () => {
      const result = extractUsingConfig(htmlSnippet, {
        fields: {
          price: {
            selector: '#non-existent-id',
            fallbackSelectors: [
              '.non-existent-class',
              '.font-mono.text-2xl',
              'p:contains("Starting at") + p',
            ],
            attribute: 'text',
            type: 'number',
          },
        },
      });

      expect(result).toEqual({ price: 2215 });
    });

    it('cascades to fallbackSelectors when primary selector matches but fails type coercion', () => {
      const result = extractUsingConfig(htmlSnippet, {
        fields: {
          price: {
            selector: '.product .label', // Matches "Starting at", which cannot coerce to number
            fallbackSelectors: ['.font-mono.text-2xl'],
            attribute: 'text',
            type: 'number',
          },
        },
      });

      expect(result).toEqual({ price: 2215 });
    });

    it('returns empty result when primary and all fallback selectors fail', () => {
      const result = extractUsingConfig(htmlSnippet, {
        fields: {
          price: {
            selector: '#not-there',
            fallbackSelectors: ['.also-not-there', '.not-found-either'],
            attribute: 'text',
            type: 'number',
          },
        },
      });

      expect(result).toEqual({});
    });
  });
});
