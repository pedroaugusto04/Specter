import type { DocumentSnapshot } from './contracts.js';
import type { ExecutionResult } from './executor.js';
import type { ScrapeResult } from '../providers/scraping/scraper.interface.js';
import type { PlanExecutionResult } from '../services/planExecutionService.js';

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

export function toPlanExecutionResult(
  result: Pick<ExecutionResult, 'data' | 'report' | 'snapshot' | 'durationMs'>
): PlanExecutionResult {
  return {
    data: result.data,
    report: result.report,
    scrape: snapshotToScrapeResult(result.snapshot, result.durationMs),
  };
}
