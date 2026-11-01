import { env } from '../../config/env.js';
import { CheerioScraperEngine } from './cheerioHttpScraper.provider.js';
import { PlaywrightScraperEngine } from './playwrightScraper.provider.js';
import type { IScraperEngine } from './scraper.interface.js';

export function createScraperEngine(
  engineName: 'playwright' | 'cheerio' = env.SCRAPER_ENGINE
): IScraperEngine {
  switch (engineName) {
    case 'cheerio':
      return new CheerioScraperEngine();
    case 'playwright':
    default:
      return new PlaywrightScraperEngine();
  }
}
