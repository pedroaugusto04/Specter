import type {
  DocumentAdapter,
  DocumentSession,
  ExtractionPlan,
  ExecutionContext,
} from '../contracts.js';
import { AntiBotBlockedError, NavigationTimeoutError } from '../../errors/domainErrors.js';
/** Passive acquisition can replace a blocked browser, but never pretends to support interactions. */
export class DiscoveryDocumentAdapter implements DocumentAdapter {
  constructor(
    private readonly browser: DocumentAdapter,
    private readonly passive: DocumentAdapter
  ) {}
  async open(
    url: string,
    plan: ExtractionPlan,
    context: ExecutionContext,
    options: { storageState?: unknown }
  ): Promise<DocumentSession> {
    let session: DocumentSession | undefined;
    try {
      session = await this.browser.open(url, plan, context, options);
      await session.snapshot();
      return session;
    } catch (error) {
      await session?.close();
      if (!(error instanceof AntiBotBlockedError || error instanceof NavigationTimeoutError))
        throw error;
      context.check();
      return this.passive.open(url, plan, context, options);
    }
  }
}
