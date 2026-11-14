import type { IBrowserCapacity } from '../../resources/browserCapacity.js';
import { BrowserDocumentAdapter } from '../../extraction/adapters/browserDocument.adapter.js';
import { executionPolicy } from '../../extraction/policy.js';
import { env } from '../../config/env.js';
import { AccessScraperEngine } from './accessScraper.provider.js';
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
  capacity: IBrowserCapacity,
  engineName: 'playwright' | 'cheerio' = env.SCRAPER_ENGINE
): IScraperEngine {
  const localEngines: IScraperEngine[] = [];

  if (engineName === 'cheerio') {
    localEngines.push(new CheerioScraperEngine());
  } else {
    if (env.HTTP_PROXY) {
      localEngines.push(
        new PlaywrightScraperEngine(
          new BrowserDocumentAdapter(executionPolicy(), capacity, env.HTTP_PROXY),
          executionPolicy()
        )
      );
    }
    localEngines.push(
      new PlaywrightScraperEngine(
        new BrowserDocumentAdapter(executionPolicy(), capacity),
        executionPolicy()
      )
    );
  }

  const unblockers = createUnblockers();

  return new AccessScraperEngine(localEngines, unblockers);
}

export function createUnblockers() {
  return [
    new CrawlbaseUnblockerProvider(),
    new ZenRowsUnblockerProvider(),
    new ScraperApiUnblockerProvider(),
    new ScrapingBeeUnblockerProvider(),
  ];
}
export function createHttpCandidates() {
  return [
    { engine: new CheerioScraperEngine(), external: false },
    ...createUnblockers()
      .filter((provider) => provider.isEnabled())
      .map((engine) => ({ engine, external: true })),
  ];
}
