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
  constructor(
    private readonly browser: DocumentAdapter,
    private readonly passive: DocumentCandidate[]
  ) {}
  async open(
    url: string,
    request: DocumentRequest,
    context: ExecutionContext,
    options: { storageState?: unknown }
  ): Promise<DocumentSession> {
    const candidates = [
      { name: 'browser', external: false, adapter: this.browser },
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
