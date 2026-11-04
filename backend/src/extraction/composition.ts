import { DiscoveryDocumentAdapter } from './adapters/discoveryDocument.adapter.js';
import { standardSourceReaders } from './sources.js';
import { env } from '../config/env.js';
import type { IScraperEngine } from '../providers/scraping/scraper.interface.js';
import { executionPolicy } from './policy.js';
import { BrowserDocumentAdapter } from './adapters/browserDocument.adapter.js';
import { HttpDocumentAdapter } from './adapters/httpDocument.adapter.js';
import { ExtractionExecutor } from './executor.js';
import { PageExtractor } from './pageExtractor.js';
import { PlanExecutionService } from '../services/planExecutionService.js';

export function composeExtraction(scraper: IScraperEngine) {
  const policy = executionPolicy();
  const browser = new BrowserDocumentAdapter(policy, env.HTTP_PROXY || undefined);
  const http = new HttpDocumentAdapter(scraper);
  const discovery = new DiscoveryDocumentAdapter(browser, http);
  const executor = new ExtractionExecutor(
    { http, browser },
    new PageExtractor(standardSourceReaders()),
    policy
  );
  return { executor, planExecutor: new PlanExecutionService(executor), browser, discovery, policy };
}
