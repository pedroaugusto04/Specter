import { Transport } from '../constants.js';
import type {
  DocumentAdapter,
  DocumentSession,
  ExtractionPlan,
  ExecutionContext,
} from '../contracts.js';
import type { IScraperEngine } from '../../providers/scraping/scraper.interface.js';
import { assertSafeUrl } from '../../utils/ssrfValidator.js';

export class HttpDocumentAdapter implements DocumentAdapter {
  constructor(private readonly scraper: IScraperEngine) {}
  async open(
    url: string,
    plan: ExtractionPlan,
    context: ExecutionContext,
    options: { storageState?: unknown; captureScreenshot?: boolean }
  ): Promise<DocumentSession> {
    context.check();
    const result = await this.scraper.fetchHtml(await assertSafeUrl(url, 'targetUrl'), {
      timeoutMs: context.remaining(),
      signal: context.signal,
      captureScreenshot: options.captureScreenshot,
      storageState: options.storageState as
        import('../../db/schema.js').PlaywrightStorageState | undefined,
    });
    const snapshot = {
      transport: Transport.Http,
      html: result.rawHtml,
      url: result.url,
      httpStatus: result.httpStatus,
      responses: [],
      screenshot: result.screenshot,
    };
    return {
      snapshot: async () => snapshot,
      check: async () => undefined,
      advance: async () => {
        throw new Error('HTTP documents do not support interactive pagination.');
      },
      discover: async () => {
        throw new Error('HTTP documents do not support browser discovery.');
      },
      screenshot: async () => snapshot.screenshot,
      close: async () => {},
    };
  }
}
