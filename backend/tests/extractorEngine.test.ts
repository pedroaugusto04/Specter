import { describe, expect, it } from 'vitest';
import { extractUsingConfig, validateExtractionSmokeTest } from '../src/utils/extractorEngine.js';

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

    it('extracts clean first numeric value from composite text containing labels, ranges, or currency', () => {
      const compositeHtml = `
        <html>
          <body>
            <h1 class="job-title">Senior Full Stack Engineer</h1>
            <div class="salary-badge">Faixa: R$&nbsp;12.500,00 até R$&nbsp;18.000,00 (CLT + benefícios)</div>
            <div class="openings-count">Total de 14 vagas disponíveis no momento</div>
          </body>
        </html>
      `;

      const result = extractUsingConfig(compositeHtml, {
        fields: {
          title: {
            selector: 'h1.job-title',
            attribute: 'text',
            type: 'string',
          },
          minSalary: {
            selector: '.salary-badge',
            attribute: 'text',
            type: 'number',
          },
          openings: {
            selector: '.openings-count',
            attribute: 'text',
            type: 'number',
          },
        },
      });

      expect(result).toEqual({
        title: 'Senior Full Stack Engineer',
        minSalary: 12500,
        openings: 14,
      });
    });

    it('seamlessly falls back to <meta> and JSON-LD structured metadata when SPA body is unhydrated', () => {
      const unhydratedSpaHtml = `
        <html>
          <head>
            <meta property="og:title" content="Smartphone Samsung Galaxy A07 256GB 8GB RAM Verde" />
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Smartphone Samsung Galaxy A07 256GB 8GB RAM Verde",
                "offers": [
                  {
                    "@type": "Offer",
                    "price": "944.1",
                    "priceCurrency": "BRL"
                  }
                ]
              }
            </script>
          </head>
          <body>
            <div id="__next"><header>busque aqui seu produto</header></div>
          </body>
        </html>
      `;

      const result = extractUsingConfig(unhydratedSpaHtml, {
        fields: {
          title: {
            selector: 'h1[class*="ProductInfoCenter_title"]',
            fallbackSelectors: ['h1', 'meta[property="og:title"]', 'meta[itemprop="name"]'],
            attribute: 'text',
            type: 'string',
          },
          price: {
            selector: '[class*="ProductPrice_productPrice"]',
            fallbackSelectors: ['meta[property="product:price:amount"]', 'meta[itemprop="price"]'],
            attribute: 'text',
            type: 'number',
          },
        },
      });

      expect(result).toEqual({
        title: 'Smartphone Samsung Galaxy A07 256GB 8GB RAM Verde',
        price: 944.1,
      });
    });
  });
});
