import type { DocumentSnapshot } from './contracts.js';
import type { ScrapeResult } from '../providers/scraping/scraper.interface.js';

export function snapshotToScrapeResult(
  snapshot: DocumentSnapshot,
  durationMs: number
): ScrapeResult {
  return {
    rawHtml: snapshot.html,
    url: snapshot.url,
    httpStatus: snapshot.httpStatus,
    durationMs,
    screenshot: snapshot.screenshot ? Buffer.from(snapshot.screenshot) : undefined,
  };
}
