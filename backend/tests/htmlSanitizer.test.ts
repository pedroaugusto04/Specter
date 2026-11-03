import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../src/utils/htmlSanitizer.js';

describe('HTML DOM Sanitization & Node Pruning (sanitizeHtml)', () => {
  it('strips scripts, styles, SVGs, iframes, noscript, meta, link, canvas, and HTML comments', () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <link rel="stylesheet" href="/app.css" />
          <style>.hidden { display: none; }</style>
          <script>window.__SECRET__ = "token";</script>
        </head>
        <body>
          <!-- internal developer comment -->
          <noscript>Enable JS</noscript>
          <iframe src="https://ads.example.com"></iframe>
          <canvas id="chart"></canvas>
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>
          <main id="content">
            <h1 data-testid="headline">Oferta Especial</h1>
          </main>
        </body>
      </html>
    `;

    const sanitized = sanitizeHtml(rawHtml);

    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('<style');
    expect(sanitized).not.toContain('<svg');
    expect(sanitized).not.toContain('<iframe');
    expect(sanitized).not.toContain('<noscript');
    expect(sanitized).not.toContain('<link');
    expect(sanitized).not.toContain('<meta');
    expect(sanitized).not.toContain('<canvas');
    expect(sanitized).not.toContain('internal developer comment');
    expect(sanitized).toContain('data-testid="headline"');
    expect(sanitized).toContain('Oferta Especial');
  });

  it('removes telemetry/tracking attributes, inline event handlers, and base64 data:image payloads while keeping semantic attributes', () => {
    const rawHtml = `
      <div
        id="product-card"
        data-testid="card-1"
        data-tracking-id="trk-999"
        data-analytics-event="impression"
        aria-live="polite"
        onclick="trackClick()"
      >
        <img class="thumb" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA" alt="Preview" />
        <img class="real-img" src="https://cdn.example.com/photo.jpg" alt="Photo" />
        <a href="/item/42" data-gtm-click="buy">Comprar</a>
      </div>
    `;

    const sanitized = sanitizeHtml(rawHtml);

    expect(sanitized).toContain('id="product-card"');
    expect(sanitized).toContain('data-testid="card-1"');
    expect(sanitized).toContain('src="https://cdn.example.com/photo.jpg"');
    expect(sanitized).toContain('href="/item/42"');

    expect(sanitized).not.toContain('data-tracking-id');
    expect(sanitized).not.toContain('data-analytics-event');
    expect(sanitized).not.toContain('aria-live');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('data-gtm-click');
    expect(sanitized).not.toContain('data:image/png;base64');
  });

  it('prunes repetitive sibling nodes inside ul, ol, and tbody to at most 3 sample items', () => {
    const rawHtml = `
      <div>
        <ul id="items-list">
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
          <li>Item 4</li>
          <li>Item 5</li>
          <li>Item 6</li>
        </ul>
        <table>
          <tbody>
            <tr><td>Row 1</td></tr>
            <tr><td>Row 2</td></tr>
            <tr><td>Row 3</td></tr>
            <tr><td>Row 4</td></tr>
            <tr><td>Row 5</td></tr>
          </tbody>
        </table>
      </div>
    `;

    const sanitized = sanitizeHtml(rawHtml);

    expect(sanitized).toContain('Item 1');
    expect(sanitized).toContain('Item 2');
    expect(sanitized).toContain('Item 3');
    expect(sanitized).not.toContain('Item 4');
    expect(sanitized).not.toContain('Item 6');

    expect(sanitized).toContain('Row 1');
    expect(sanitized).toContain('Row 3');
    expect(sanitized).not.toContain('Row 4');
    expect(sanitized).not.toContain('Row 5');
  });

  it('preserves semantic OpenGraph/Product meta tags and projects JSON-LD Product data into queryable meta tags while stripping scripts', () => {
    const rawSpaHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="google-site-verification" content="xyz123" />
          <meta property="og:title" content="Smartphone Samsung Galaxy A07 256GB" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Smartphone Samsung Galaxy A07 256GB",
              "sku": "8775733",
              "brand": { "@type": "Brand", "name": "Samsung" },
              "offers": [
                {
                  "@type": "Offer",
                  "price": "944.1",
                  "priceCurrency": "BRL",
                  "availability": "https://schema.org/InStock"
                }
              ]
            }
          </script>
        </head>
        <body>
          <div id="__next"></div>
        </body>
      </html>
    `;

    const sanitized = sanitizeHtml(rawSpaHtml);

    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('google-site-verification');
    expect(sanitized).not.toContain('viewport');
    expect(sanitized).toContain('property="og:title"');
    expect(sanitized).toContain('content="Smartphone Samsung Galaxy A07 256GB"');
    expect(sanitized).toContain('property="product:price:amount"');
    expect(sanitized).toContain('itemprop="price"');
    expect(sanitized).toContain('content="944.1"');
    expect(sanitized).toContain('itemprop="sku"');
    expect(sanitized).toContain('content="8775733"');
  });

  it('projects generic non-product Schema.org entities (e.g. JobPosting, Hotel) while ignoring structural Organization metadata', () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="application/ld+json">
            [
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                "name": "Big Corp Tech"
              },
              {
                "@context": "https://schema.org",
                "@type": "JobPosting",
                "name": "Senior AI Platform Engineer",
                "description": "Build agentic automation platforms."
              }
            ]
          </script>
        </head>
        <body><div>Job Board</div></body>
      </html>
    `;

    const sanitized = sanitizeHtml(rawHtml);

    // Organization should not be projected as the primary entity title
    expect(sanitized).not.toContain('content="Big Corp Tech"');
    // Generic entity should be projected into standard queryable meta
    expect(sanitized).toContain('property="og:title"');
    expect(sanitized).toContain('content="Senior AI Platform Engineer"');
    expect(sanitized).toContain('itemprop="description"');
    expect(sanitized).toContain('content="Build agentic automation platforms."');
  });
});
