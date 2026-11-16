import { passiveCapabilities } from '../capabilities.js';
import { detectAntiBotBlock } from '../../utils/antiBotDetector.js';
import { env } from '../../config/env.js';
import { UnsupportedCapabilityError } from '../../errors/domainErrors.js';
import { Transport } from '../constants.js';
import type {
  DocumentAdapter,
  DocumentSession,
  DocumentRequest,
  ExecutionContext,
} from '../contracts.js';
import type { IScraperEngine } from '../../providers/scraping/scraper.interface.js';
import { assertSafeUrl } from '../../utils/ssrfValidator.js';

export class HttpDocumentAdapter implements DocumentAdapter {
  constructor(
    private readonly scraper: IScraperEngine,
    private readonly external = false
  ) {}
  async open(
    url: string,
    _request: DocumentRequest,
    context: ExecutionContext,
    options: { storageState?: unknown; captureScreenshot?: boolean }
  ): Promise<DocumentSession> {
    context.check();
    const result = await this.scraper.fetchHtml(await assertSafeUrl(url, 'targetUrl'), {
      timeoutMs: Math.min(context.remaining(), env.UNBLOCKER_TIMEOUT_MS),
      signal: context.signal,
      captureScreenshot: options.captureScreenshot,
      storageState: (this.external ? undefined : options.storageState) as
        import('../../types/session.js').PlaywrightStorageState | undefined,
    });
    detectAntiBotBlock(result.url, result.rawHtml, result.httpStatus);
    const snapshot = {
      transport: Transport.Http,
      html: result.rawHtml,
      url: result.url,
      httpStatus: result.httpStatus,
      retryAfterMs: result.retryAfterMs,
      responses: [],
      screenshot: result.screenshot,
    };
    return {
      capabilities: passiveCapabilities,
      snapshot: async () => snapshot,
      check: async () => undefined,
      advance: async () => {
        throw new UnsupportedCapabilityError(
          'HTTP documents do not support interactive pagination.'
        );
      },
      discover: async () => {
        throw new UnsupportedCapabilityError('HTTP documents do not support browser discovery.');
      },
      screenshot: async () => snapshot.screenshot,
      close: async () => {},
    };
  }
}
