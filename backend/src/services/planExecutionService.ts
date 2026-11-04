import type {
  IScraperEngine,
  ScrapeOptions,
  ScrapeResult,
} from '../providers/scraping/scraper.interface.js';
import { env } from '../config/env.js';
import {
  extractionPlanSchema,
  type ExtractionPlan,
  type ExtractionReport,
} from '../types/extractionPlan.js';
import type { ExtractedPayload, ExtractedRecord } from '../types/extractor.js';
import {
  ExtractionMode,
  ExtractionQuality,
  isAcceptedExtractionQuality,
  PaginationKind,
} from '../types/enums.js';
import { extractPlanPage, recordIdentity } from '../utils/planExtraction.js';

export interface PlanExecutionResult {
  data: ExtractedPayload;
  report: ExtractionReport;
  scrape: ScrapeResult;
}
export interface IPlanExecutor {
  execute(url: string, plan: ExtractionPlan, options?: ScrapeOptions): Promise<PlanExecutionResult>;
}
export class PlanExecutionService implements IPlanExecutor {
  constructor(private readonly scraper: IScraperEngine) {}
  async execute(
    url: string,
    input: ExtractionPlan,
    options: ScrapeOptions = {}
  ): Promise<PlanExecutionResult> {
    const plan = extractionPlanSchema.parse(input);
    if (plan.pagination && plan.pagination.kind !== PaginationKind.Link) {
      if (!this.scraper.executePlan)
        throw new Error('The selected scraper does not support interactive collection extraction.');
      return this.scraper.executePlan(url, plan, options);
    }
    const started = Date.now();
    const budgetMs = Math.min(
      env.EXTRACTION_TIMEOUT_MS,
      options.timeoutMs ?? env.EXTRACTION_TIMEOUT_MS
    );
    const seen = new Set<string>();
    const records = new Map<string, ExtractedRecord>();
    const sourcesUsed: Record<string, number> = {};
    let currentUrl = url;
    const origin = new URL(url).origin;
    let result: PlanExecutionResult | undefined;
    for (let page = 0; page < env.EXTRACTION_MAX_PAGES; page++) {
      if (seen.has(currentUrl) || Date.now() - started >= budgetMs) break;
      seen.add(currentUrl);
      const scrape = await this.scraper.fetchHtml(currentUrl, {
        ...options,
        timeoutMs: Math.min(
          options.timeoutMs ?? env.EXTRACTION_TIMEOUT_MS,
          budgetMs - (Date.now() - started)
        ),
        waitForSelector: plan.readySelector,
      });
      if (new URL(scrape.url).origin !== origin)
        throw new Error('Pagination redirected outside the original origin.');
      const extracted = extractPlanPage(scrape.rawHtml, scrape.url, plan);
      for (const [source, count] of Object.entries(extracted.report.sourcesUsed))
        sourcesUsed[source] = (sourcesUsed[source] ?? 0) + count;
      result = {
        data: extracted.data,
        report: { ...extracted.report, pagesVisited: page + 1, sourcesUsed: { ...sourcesUsed } },
        scrape,
      };
      if (!isAcceptedExtractionQuality(result.report.quality)) return result;
      if (plan.mode === ExtractionMode.Single) return result;
      const items = (extracted.data as { items: ExtractedRecord[] }).items;
      for (const item of items) {
        const key = recordIdentity(item, plan.identityFields);
        if (records.has(key) && JSON.stringify(records.get(key)) !== JSON.stringify(item)) {
          result.report.quality = ExtractionQuality.Invalid;
          result.report.issues.push('Conflicting duplicate identities across pages.');
          return result;
        }
        if (!records.has(key) && records.size >= env.EXTRACTION_MAX_ITEMS) {
          result.report.quality = ExtractionQuality.Partial;
          result.report.issues.push('The configured item limit was reached before completion.');
          result.data = { items: [...records.values()], count: records.size };
          return result;
        }
        records.set(key, item);
      }
      const ordered = [...records.values()].sort((a, b) =>
        recordIdentity(a, plan.identityFields).localeCompare(recordIdentity(b, plan.identityFields))
      );
      result.data = { items: ordered, count: ordered.length };
      if (records.size > env.EXTRACTION_MAX_ITEMS) break;
      if (extracted.ended) {
        result.report.quality = records.size ? ExtractionQuality.Complete : ExtractionQuality.Empty;
        return result;
      }
      if (!extracted.nextUrl || new URL(extracted.nextUrl).origin !== origin) break;
      currentUrl = extracted.nextUrl;
    }
    if (!result) throw new Error('Collection execution produced no document.');
    result.report.quality = ExtractionQuality.Partial;
    result.report.issues.push(
      'Collection completion could not be verified within the configured limits.'
    );
    return result;
  }
}
