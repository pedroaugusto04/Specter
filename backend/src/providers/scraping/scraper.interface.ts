import type { PlaywrightStorageState } from '../../types/session.js';

export interface ScrapeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
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
