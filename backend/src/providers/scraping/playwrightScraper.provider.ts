import type {
  DocumentAdapter,
  ExecutionPolicy,
  ExtractionPlan,
} from '../../extraction/contracts.js';
import { createExecutionContext, waitForPoll } from '../../extraction/context.js';
import type { IScraperEngine, ScrapeOptions, ScrapeResult } from './scraper.interface.js';
import { snapshotToScrapeResult } from '../../extraction/scrapeResultMapper.js';
/** Passive browser acquisition uses the same browser session implementation as extraction. */
export class PlaywrightScraperEngine implements IScraperEngine {
  readonly name = 'playwright';
  constructor(
    private readonly adapter: DocumentAdapter,
    private readonly policy: ExecutionPolicy
  ) {}
  async fetchHtml(targetUrl: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const started = Date.now();
    const context = createExecutionContext(
      Math.min(options.timeoutMs ?? this.policy.timeoutMs, this.policy.timeoutMs),
      options.signal
    );
    const plan: ExtractionPlan = {
      version: 3,
      intent: {
        entity: 'Page acquisition',
        mode: 'single',
        scope: 'page',
        fields: {},
        filters: [],
        identityFields: [],
        triggerRules: [],
        triggerMatchMode: 'all',
      },
      strategy: {
        transport: 'browser',
        records: { kind: 'dom', selector: 'body' },
        fields: {},
        ready: [],
        empty: [],
      },
    };
    const session = await this.adapter.open(targetUrl, plan, context, options);
    try {
      if (options.waitForSelector) {
        const condition = {
          kind: 'exists' as const,
          locator: { kind: 'css' as const, selector: options.waitForSelector },
        };
        const deadline = Math.min(context.deadline, Date.now() + this.policy.actionTimeoutMs);
        while (!(await session.check(condition)) && Date.now() < deadline)
          await waitForPoll(context, this.policy);
      }
      const snapshot = await session.snapshot();
      const screenshot = options.captureScreenshot
        ? await session.screenshot().catch(() => undefined)
        : undefined;
      return snapshotToScrapeResult(
        { ...snapshot, screenshot: screenshot ?? undefined },
        Date.now() - started
      );
    } finally {
      await session.close();
    }
  }
}
