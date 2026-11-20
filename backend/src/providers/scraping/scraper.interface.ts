import type { PlaywrightStorageState } from '../../types/session.js';

export interface ScrapeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  waitForSelector?: string;
  pageLanguage?: string;
  storageState?: PlaywrightStorageState;
  captureScreenshot?: boolean;
  premium?: boolean;
}

export interface ScrapeResult {
  retryAfterMs?: number;
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
