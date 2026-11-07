import { UpstreamHttpError } from '../../errors/domainErrors.js';
import { env } from '../../config/env.js';
import { createExecutionContext } from '../../extraction/context.js';
import { acquire } from '../../acquisition/runner.js';
import { detectAntiBotBlock } from '../../utils/antiBotDetector.js';
import type { IScraperEngine, ScrapeOptions, ScrapeResult } from './scraper.interface.js';
import type { IUnblockerProvider } from './unblockers/unblocker.interface.js';

export interface ScraperCandidate {
  engine: IScraperEngine;
  external: boolean;
}
/** Access-only acquisition; validated plan execution consumes the candidate catalog. */
export class AccessScraperEngine implements IScraperEngine {
  readonly name: string;
  constructor(
    private readonly localEngine: IScraperEngine,
    private readonly unblockers: IUnblockerProvider[] = []
  ) {
    this.name = `access(${localEngine.name})`;
  }
  async fetchHtml(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const context = createExecutionContext(
      Math.min(options.timeoutMs ?? env.PLAYWRIGHT_TIMEOUT_MS, env.EXTRACTION_TIMEOUT_MS),
      options.signal
    );
    return acquire(
      [
        { engine: this.localEngine, external: false },
        ...this.unblockers
          .filter((item) => item.isEnabled())
          .map((engine) => ({ engine, external: true })),
      ].map(({ engine, external }) => ({
        name: engine.name,
        external,
        run: async () => {
          const result = await engine.fetchHtml(url, {
            ...options,
            storageState: external ? undefined : options.storageState,
            timeoutMs: Math.min(
              context.remaining(),
              external ? env.UNBLOCKER_TIMEOUT_MS : env.PLAYWRIGHT_TIMEOUT_MS
            ),
            signal: context.signal,
          });
          detectAntiBotBlock(result.url, result.rawHtml, result.httpStatus);
          if (result.httpStatus >= 400) throw new UpstreamHttpError(result.httpStatus);
          return result;
        },
      })),
      context,
      () => true
    );
  }
}
