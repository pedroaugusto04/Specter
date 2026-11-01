export interface ScrapeOptions {
  timeoutMs?: number;
  waitForSelector?: string;
}

export interface ScrapeResult {
  rawHtml: string;
  httpStatus: number;
  url: string;
  durationMs: number;
}

export interface IScraperEngine {
  readonly name: string;
  fetchHtml(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;
}
