import type { PlaywrightStorageState } from '../../db/schema.js';

export interface ScrapeOptions {
  timeoutMs?: number;
  waitForSelector?: string;
  storageState?: PlaywrightStorageState;
  captureScreenshot?: boolean;
}

export interface ScrapeResult {
  rawHtml: string;
  httpStatus: number;
  url: string;
  durationMs: number;
  screenshot?: Buffer;
}

export interface IScraperEngine {
  readonly name: string;
  fetchHtml(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;
}
