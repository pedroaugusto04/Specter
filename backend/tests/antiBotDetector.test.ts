import { describe, expect, it } from 'vitest';
import { AntiBotBlockedError } from '../src/errors/domainErrors.js';
import { CheerioScraperEngine } from '../src/providers/scraping/cheerioHttpScraper.provider.js';
import { detectAntiBotBlock } from '../src/utils/antiBotDetector.js';

describe('Anti-Bot Detection & Verification Interstitial Defense', () => {
  it('throws AntiBotBlockedError for HTTP 403 and 429 status codes', () => {
    expect(() =>
      detectAntiBotBlock('https://example.com/product', '<html>OK</html>', 403)
    ).toThrowError(AntiBotBlockedError);

    expect(() =>
      detectAntiBotBlock('https://example.com/product', '<html>OK</html>', 429)
    ).toThrowError(AntiBotBlockedError);
  });

  it('detects Mercado Livre silent redirect to account-verification even with HTTP 200', () => {
    const mlVerificationUrl =
      'https://www.mercadolivre.com.br/gz/account-verification?go=https%3A%2F%2Fwww.mercadolivre.com.br%2Fnotebook-dell&tid=xyz';

    expect(() =>
      detectAntiBotBlock(
        mlVerificationUrl,
        '<html><title id="root-title">Mercado Libre</title></html>',
        200
      )
    ).toThrowError(AntiBotBlockedError);
  });

  it('detects Cloudflare and CAPTCHA challenge screens in page content', () => {
    const cloudflareHtml =
      '<html><head><title>Attention Required! | Cloudflare</title></head><body><div class="cf-chl-widget"></div></body></html>';

    expect(() => detectAntiBotBlock('https://example.com/store', cloudflareHtml, 200)).toThrowError(
      AntiBotBlockedError
    );
  });

  it('detects Akamai challenge and bot interstitial screens in page content', () => {
    const akamaiHtml = `
      <html><body>
        <div class="scf-akamai-logo-sec-abc">
          <p class="scf-akamai-protected-by">Powered and protected by</p>
          <div class="scf-akamai-logo-img">
            <img src="https://www.akamai.com/site/ko/images/logo/akamai-logo1.svg" class="scf-akamai-logo" alt="Akamai">
          </div>
          <div class="akamai-privacy"><a href="https://www.akamai.com/privacy">Privacy</a></div>
        </div>
      </body></html>
    `;

    expect(() =>
      detectAntiBotBlock('https://www.magazineluiza.com.br/produto', akamaiHtml, 200)
    ).toThrowError(AntiBotBlockedError);
  });

  it('passes silently for legitimate, unblocked product pages', () => {
    const legitimateHtml =
      '<html><body><h1>Notebook Dell Inspiron</h1><span class="price">R$ 3.500</span></body></html>';

    expect(() =>
      detectAntiBotBlock('https://www.mercadolivre.com.br/p/MLB12345', legitimateHtml, 200)
    ).not.toThrow();
  });

  it('does NOT block legitimate product pages that contain an embedded recaptcha or hcaptcha widget in the footer', () => {
    const legitimateHtmlWithRecaptcha = `
      <html>
        <head><title>Notebook Dell Inspiron 15 - Loja Oficial</title></head>
        <body>
          <main>
            <h1>Notebook Dell Inspiron</h1>
            <span class="price">R$ 3.500</span>
            <p>Processador Intel Core i7, 16GB de RAM, SSD de 512GB e placa de vídeo dedicada.</p>
          </main>
          <footer>
            <form action="/newsletter">
              <input type="email" placeholder="Assine a newsletter" />
              <div class="g-recaptcha" data-sitekey="6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-"></div>
              <div class="h-captcha" data-sitekey="10000000-ffff-ffff-ffff-000000000001"></div>
            </form>
          </footer>
        </body>
      </html>
    `;

    expect(() =>
      detectAntiBotBlock('https://store.example.com/product/dell-inspiron', legitimateHtmlWithRecaptcha, 200)
    ).not.toThrow();
  });

  it('CheerioScraperEngine throws AntiBotBlockedError when response redirects to verification page', async () => {
    // Mock response.url being redirected
    const mockRedirectFetch: typeof fetch = async () => {
      const resp = new Response('<title id="root-title">Mercado Libre</title>', {
        status: 200,
      });
      Object.defineProperty(resp, 'url', {
        value: 'https://www.mercadolivre.com.br/gz/account-verification?go=https://...&tid=123',
      });
      return resp;
    };

    const scraper = new CheerioScraperEngine({ fetchFn: mockRedirectFetch });

    await expect(
      scraper.fetchHtml('https://www.mercadolivre.com.br/notebook-dell')
    ).rejects.toThrowError(AntiBotBlockedError);
  });
});
