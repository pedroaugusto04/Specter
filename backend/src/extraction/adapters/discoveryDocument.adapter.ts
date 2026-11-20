import type {
  DocumentAdapter,
  DocumentSession,
  DocumentRequest,
  ExecutionContext,
} from '../contracts.js';
import type { DocumentCandidate } from '../../acquisition/coordinatedExecutor.js';
import { acquire } from '../../acquisition/runner.js';
import { requiresBrowser } from '../capabilities.js';

export class DiscoveryDocumentAdapter implements DocumentAdapter {
  private readonly browsers: Array<{ name: string; external: boolean; adapter: DocumentAdapter }>;

  constructor(
    browser: DocumentAdapter | Array<{ name: string; external?: boolean; adapter: DocumentAdapter }>,
    private readonly passive: DocumentCandidate[]
  ) {
    if (Array.isArray(browser)) {
      this.browsers = browser.map((b) => ({
        name: b.name,
        external: b.external ?? false,
        adapter: b.adapter,
      }));
    } else {
      this.browsers = [{ name: 'browser', external: false, adapter: browser }];
    }
  }

  async open(
    url: string,
    request: DocumentRequest,
    context: ExecutionContext,
    options: { pageLanguage?: string; storageState?: unknown }
  ): Promise<DocumentSession> {
    const candidates = [
      ...this.browsers,
      ...(request.strategy && requiresBrowser(request.strategy) ? [] : this.passive),
    ];
    return acquire(
      candidates.map((candidate) => ({
        ...candidate,
        run: async () => {
          const session = await candidate.adapter.open(url, request, context, {
            ...options,
            storageState: candidate.external ? undefined : options.storageState,
          });
          try {
            await session.snapshot();
            context.check();
            return session;
          } catch (error) {
            await session.close();
            throw error;
          }
        },
      })),
      context,
      () => true
    );
  }
}
