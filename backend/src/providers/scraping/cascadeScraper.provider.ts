import { env } from '../../config/env.js';
import { NavigationTimeoutError } from '../../errors/domainErrors.js';
import type { ExtractionPlan } from '../../types/extractionPlan.js';
import { AntiBotBlockedError } from '../../errors/domainErrors.js';
import { logger } from '../../utils/logger.js';
import type { IScraperEngine, ScrapeOptions, ScrapeResult } from './scraper.interface.js';
import type { IUnblockerProvider } from './unblockers/unblocker.interface.js';

export class CascadeScraperEngine implements IScraperEngine {
  public readonly name: string;
  private readonly localEngine: IScraperEngine;
  private readonly unblockers: IUnblockerProvider[];

  constructor(localEngine: IScraperEngine, unblockers: IUnblockerProvider[] = []) {
    this.localEngine = localEngine;
    this.unblockers = unblockers;
    this.name = `cascade(${localEngine.name})`;
  }

  async executePlan(url: string, plan: ExtractionPlan, options?: ScrapeOptions) {
    if (!this.localEngine.executePlan)
      throw new Error('Interactive extraction is unavailable for the selected scraper.');
    return this.localEngine.executePlan(url, plan, options);
  }

  getUnblockers(): IUnblockerProvider[] {
    return [...this.unblockers];
  }

  async fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    const startedAt = Date.now();
    const timeoutMs = Math.min(
      options?.timeoutMs ?? env.PLAYWRIGHT_TIMEOUT_MS,
      env.EXTRACTION_TIMEOUT_MS
    );
    const remainingMs = () => timeoutMs - (Date.now() - startedAt);
    const enabledUnblockers = this.unblockers.filter((u) => u.isEnabled());
    const unblockerErrors: Array<{ provider: string; error: string }> = [];

    // 1. Try configured unblocker providers in cascade priority
    for (const unblocker of enabledUnblockers) {
      const remaining = remainingMs();
      if (remaining <= 0) break;
      try {
        logger.debug('Attempting HTML extraction via unblocker', {
          provider: unblocker.name,
          url: targetUrl,
        });

        const result = await unblocker.fetchHtml(targetUrl, { ...options, timeoutMs: remaining });

        logger.info('HTML successfully extracted via anti-bot unblocker', {
          provider: unblocker.name,
          url: targetUrl,
          durationMs: result.durationMs,
        });

        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        unblockerErrors.push({ provider: unblocker.name, error: errorMsg });

        logger.warn(
          'Anti-bot unblocker provider failed or quota exhausted; cascading to next provider',
          {
            provider: unblocker.name,
            url: targetUrl,
            errorMessage: errorMsg,
          }
        );
      }
    }

    if (enabledUnblockers.length > 0) {
      logger.warn(
        'All configured anti-bot unblockers failed or exhausted; falling back to local scraper engine',
        {
          localEngine: this.localEngine.name,
          url: targetUrl,
          attemptedProviders: enabledUnblockers.map((u) => u.name),
        }
      );
    }

    // 2. Fallback to local scraping engine (Playwright / Cheerio)
    const localTimeout = remainingMs();
    if (localTimeout <= 0) {
      throw new NavigationTimeoutError(
        `Scraping cascade exceeded its ${timeoutMs}ms total budget.`
      );
    }
    try {
      return await this.localEngine.fetchHtml(targetUrl, { ...options, timeoutMs: localTimeout });
    } catch (err) {
      if (err instanceof AntiBotBlockedError && unblockerErrors.length > 0) {
        const failureSummary = unblockerErrors.map((e) => `${e.provider}: ${e.error}`).join(' | ');

        throw new AntiBotBlockedError(
          `Target site blocked automated requests. All configured unblockers were exhausted or failed (${failureSummary}). Local engine was also blocked.`,
          err.httpStatus,
          err
        );
      }
      throw err;
    }
  }
}
