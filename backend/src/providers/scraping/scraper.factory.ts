import { BrowserDocumentAdapter } from '../../extraction/adapters/browserDocument.adapter.js';
import { executionPolicy } from '../../extraction/policy.js';
import { env } from '../../config/env.js';
import { CascadeScraperEngine } from './cascadeScraper.provider.js';
import { CheerioScraperEngine } from './cheerioHttpScraper.provider.js';
import { PlaywrightScraperEngine } from './playwrightScraper.provider.js';
import type { IScraperEngine } from './scraper.interface.js';
import {
  CrawlbaseUnblockerProvider,
  ScraperApiUnblockerProvider,
  ScrapingBeeUnblockerProvider,
  ZenRowsUnblockerProvider,
} from './unblockers/index.js';

export function createScraperEngine(
  engineName: 'playwright' | 'cheerio' = env.SCRAPER_ENGINE
): IScraperEngine {
  const localEngine =
    engineName === 'cheerio'
      ? new CheerioScraperEngine()
      : new PlaywrightScraperEngine(
          new BrowserDocumentAdapter(executionPolicy(), env.HTTP_PROXY || undefined),
          executionPolicy()
        );

  const unblockers = [
    new ZenRowsUnblockerProvider(),
    new ScraperApiUnblockerProvider(),
    new ScrapingBeeUnblockerProvider(),
    new CrawlbaseUnblockerProvider(),
  ];

  return new CascadeScraperEngine(localEngine, unblockers);
}
