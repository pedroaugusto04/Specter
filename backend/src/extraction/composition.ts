import { Transport } from './constants.js';
import type { IBrowserCapacity } from '../resources/browserCapacity.js';
import { DiscoveryDocumentAdapter } from './adapters/discoveryDocument.adapter.js';
import { standardSourceReaders } from './sources.js';
import { env } from '../config/env.js';
import { executionPolicy } from './policy.js';
import { BrowserDocumentAdapter } from './adapters/browserDocument.adapter.js';
import { HttpDocumentAdapter } from './adapters/httpDocument.adapter.js';
import { CoordinatedExecutor } from '../acquisition/coordinatedExecutor.js';
import type { ScraperCandidate } from '../providers/scraping/accessScraper.provider.js';
import { PageExtractor } from './pageExtractor.js';
import { PlanExecutionService } from '../services/planExecutionService.js';

export function composeExtraction(scrapers: ScraperCandidate[], capacity: IBrowserCapacity) {
  const policy = executionPolicy();
  const browser = new BrowserDocumentAdapter(policy, capacity, env.HTTP_PROXY || undefined);
  const candidates = scrapers.map(({ engine, external }) => ({
    name: engine.name,
    external,
    transport: Transport.Http,
    adapter: new HttpDocumentAdapter(engine, external),
  }));
  const discovery = new DiscoveryDocumentAdapter(browser, candidates);
  const executor = new CoordinatedExecutor(
    [
      { name: 'browser', external: false, transport: Transport.Browser, adapter: browser },
      ...candidates,
    ],
    new PageExtractor(standardSourceReaders()),
    policy
  );
  return { executor, planExecutor: new PlanExecutionService(executor), browser, discovery, policy };
}
