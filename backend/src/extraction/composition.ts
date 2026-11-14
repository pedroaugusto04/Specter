import { Transport } from './constants.js';
import type { IBrowserCapacity } from '../resources/browserCapacity.js';
import { DiscoveryDocumentAdapter } from './adapters/discoveryDocument.adapter.js';
import { standardSourceReaders } from './sources.js';
import { env } from '../config/env.js';
import { executionPolicy } from './policy.js';
import { BrowserDocumentAdapter } from './adapters/browserDocument.adapter.js';
import { HttpDocumentAdapter } from './adapters/httpDocument.adapter.js';
import { CoordinatedExecutor, type DocumentCandidate } from '../acquisition/coordinatedExecutor.js';
import type { ScraperCandidate } from '../providers/scraping/accessScraper.provider.js';
import { PageExtractor } from './pageExtractor.js';
import { PlanExecutionService } from '../services/planExecutionService.js';

export function composeExtraction(scrapers: ScraperCandidate[], capacity: IBrowserCapacity) {
  const policy = executionPolicy();
  const defaultBrowser = new BrowserDocumentAdapter(policy, capacity);
  const browserCandidates: DocumentCandidate[] = [];

  if (env.HTTP_PROXY) {
    browserCandidates.push({
      name: 'browser-proxied',
      external: false,
      transport: Transport.Browser,
      adapter: new BrowserDocumentAdapter(policy, capacity, env.HTTP_PROXY),
    });
  }

  if (env.HTTP_FALLBACK_PROXY) {
    browserCandidates.push({
      name: 'browser-fallback-proxied',
      external: false,
      transport: Transport.Browser,
      adapter: new BrowserDocumentAdapter(policy, capacity, env.HTTP_FALLBACK_PROXY),
    });
  }

  browserCandidates.push({
    name: 'browser',
    external: false,
    transport: Transport.Browser,
    adapter: defaultBrowser,
  });

  const candidates = scrapers.map(({ engine, external }) => ({
    name: engine.name,
    external,
    transport: Transport.Http,
    adapter: new HttpDocumentAdapter(engine, external),
  }));
  const discovery = new DiscoveryDocumentAdapter(browserCandidates, candidates);
  const executor = new CoordinatedExecutor(
    [
      ...browserCandidates,
      ...candidates,
    ],
    new PageExtractor(standardSourceReaders()),
    policy
  );
  return {
    executor,
    planExecutor: new PlanExecutionService(executor),
    browser: browserCandidates[0]?.adapter ?? defaultBrowser,
    discovery,
    policy,
  };
}
