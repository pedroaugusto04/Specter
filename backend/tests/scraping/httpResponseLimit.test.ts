import { describe, expect, it, vi } from 'vitest';
import { CheerioScraperEngine } from '../../src/providers/scraping/cheerioHttpScraper.provider.js';

function scraper(response: Response, maxResponseBytes: number) {
  return new CheerioScraperEngine({
    fetchFn: vi.fn(async () => response) as typeof fetch,
    maxResponseBytes,
  });
}

describe('HTTP scraping download budget', () => {
  it('preserves UTF-8 text split across network chunks at the exact limit', async () => {
    const bytes = new TextEncoder().encode('café');
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 4));
          controller.enqueue(bytes.slice(4));
          controller.close();
        },
      })
    );
    await expect(scraper(response, 5).fetchHtml('https://example.com')).resolves.toMatchObject({
      rawHtml: 'café',
    });
  });

  it('cancels an oversized declared body before reading it', async () => {
    const cancel = vi.fn();
    const pull = vi.fn();
    const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), {
      headers: { 'content-length': '100' },
    });
    await expect(scraper(response, 5).fetchHtml('https://example.com')).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
      isRetryable: false,
    });
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([{}, { 'content-length': '1' }, { 'content-encoding': 'gzip' }])(
    'cancels chunked/underreported/decoded responses when bytes exceed the limit: %j',
    async (headers) => {
      const cancel = vi.fn();
      const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
        controller.enqueue(new TextEncoder().encode('abc'));
      });
      const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), {
        headers: headers as HeadersInit,
      });
      await expect(scraper(response, 5).fetchHtml('https://example.com')).rejects.toMatchObject({
        code: 'RESPONSE_TOO_LARGE',
      });
      expect(pull).toHaveBeenCalledTimes(2);
      expect(cancel).toHaveBeenCalledOnce();
    }
  );
});
