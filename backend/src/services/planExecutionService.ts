import { extractionPlanSchema } from '../types/extractionPlan.js';
import type { ScrapeOptions, ScrapeResult } from '../providers/scraping/scraper.interface.js';
import type { ExtractionPlan, ExtractionReport } from '../types/extractionPlan.js';
import type { ExtractedPayload } from '../types/extractor.js';
import type { IExtractionExecutor } from '../extraction/executor.js';
import { snapshotToScrapeResult } from '../extraction/scrapeResultMapper.js';
export interface PlanExecutionResult {
  data: ExtractedPayload;
  report: ExtractionReport;
  scrape: ScrapeResult;
}
export interface IPlanExecutor {
  execute(url: string, plan: ExtractionPlan, options?: ScrapeOptions): Promise<PlanExecutionResult>;
}
/** Application port; the common executor and its adapters are composed at bootstrap. */
export class PlanExecutionService implements IPlanExecutor {
  constructor(private readonly executor: IExtractionExecutor) {}
  async execute(
    url: string,
    plan: ExtractionPlan,
    options: ScrapeOptions = {}
  ): Promise<PlanExecutionResult> {
    const result = await this.executor.execute(url, plan, options);
    return {
      data: result.data,
      report: result.report,
      scrape: snapshotToScrapeResult(result.snapshot, result.durationMs),
    };
  }
}
