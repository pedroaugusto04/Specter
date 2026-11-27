import { env } from '../../config/env.js';
import { BrowserDocumentAdapter } from '../../extraction/adapters/browserDocument.adapter.js';
import { executionPolicy } from '../../extraction/policy.js';
import type { IBrowserCapacity } from '../../resources/browserCapacity.js';
import { AccessScraperEngine } from './accessScraper.provider.js';
import { CheerioScraperEngine } from './cheerioHttpScraper.provider.js';
import { PlaywrightScraperEngine } from './playwrightScraper.provider.js';
import type { IScraperEngine } from './scraper.interface.js';
import {
  CrawlbaseUnblockerProvider,
  DecodoUnblockerProvider,
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
    const policy = executionPolicy();
    const proxyCascade = [env.HTTP_PROXY, env.HTTP_FALLBACK_PROXY, undefined].filter(
      (proxy, idx) => idx === 2 || Boolean(proxy)
    );
    for (const proxy of proxyCascade) {
      localEngines.push(
        new PlaywrightScraperEngine(new BrowserDocumentAdapter(policy, capacity, proxy), policy)
      );
    }
  }

  return new AccessScraperEngine(localEngines, createUnblockers());
}

export function createUnblockers() {
  return [
    new CrawlbaseUnblockerProvider(),
    new ZenRowsUnblockerProvider(),
    new DecodoUnblockerProvider(),
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
