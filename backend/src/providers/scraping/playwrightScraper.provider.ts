import type { ExtractionPlan } from '../../types/extractionPlan.js';
import type { PlanExecutionResult } from '../../services/planExecutionService.js';
import type { ExtractedRecord } from '../../types/extractor.js';
import { extractPlanPage, recordIdentity } from '../../utils/planExtraction.js';
import { existsSync } from 'fs';
import { chromium, type Browser, type BrowserContext, type LaunchOptions } from 'playwright';
import { env } from '../../config/env.js';
import {
  ExtractionQuality,
  isAcceptedExtractionQuality,
  PaginationKind,
} from '../../types/enums.js';
import { NavigationTimeoutError } from '../../errors/domainErrors.js';
import { detectAntiBotBlock } from '../../utils/antiBotDetector.js';
import { assertSafeUrl } from '../../utils/ssrfValidator.js';
import type { IScraperEngine, ScrapeOptions, ScrapeResult } from './scraper.interface.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

const SYSTEM_BROWSER_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
];

function resolveFallbackBrowserPath(): string | undefined {
  for (const candidate of SYSTEM_BROWSER_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function launchBrowserWithFallback(launchOptions: LaunchOptions): Promise<Browser> {
  try {
    return await chromium.launch(launchOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Executable doesn't exist")) {
      const systemExecutable = resolveFallbackBrowserPath();
      if (systemExecutable) {
        return await chromium.launch({
          ...launchOptions,
          executablePath: systemExecutable,
        });
      }
    }
    throw err;
  }
}

export class PlaywrightScraperEngine implements IScraperEngine {
  public readonly name = 'playwright';
  private readonly defaultTimeoutMs: number;

  constructor(options: { timeoutMs?: number } = {}) {
    this.defaultTimeoutMs = options.timeoutMs ?? env.PLAYWRIGHT_TIMEOUT_MS;
  }

  async executePlan(
    targetUrl: string,
    plan: ExtractionPlan,
    options: ScrapeOptions = {}
  ): Promise<PlanExecutionResult> {
    const safeUrl = await assertSafeUrl(targetUrl, 'targetUrl');
    const browser = await launchBrowserWithFallback({ headless: true });
    let context: BrowserContext | undefined;
    const started = Date.now();
    const budgetMs = Math.min(
      env.EXTRACTION_TIMEOUT_MS,
      options.timeoutMs ?? env.EXTRACTION_TIMEOUT_MS
    );
    const timer = setTimeout(() => void browser.close().catch(() => {}), budgetMs);
    try {
      context = await browser.newContext({
        userAgent: DEFAULT_USER_AGENT,
        storageState: options.storageState,
      });
      const navigation = { origin: new URL(safeUrl).origin };
      await context.route('**/*', async (route) => {
        try {
          const url = await assertSafeUrl(route.request().url(), 'requestUrl');
          if (
            navigation.origin &&
            route.request().isNavigationRequest() &&
            new URL(url).origin !== navigation.origin
          )
            return await route.abort();
          await route.continue();
        } catch {
          await route.abort();
        }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(Math.min(env.PLAYWRIGHT_TIMEOUT_MS, budgetMs));
      const response = await page.goto(safeUrl, { waitUntil: 'domcontentloaded' });
      if (new URL(page.url()).origin !== navigation.origin)
        throw new Error('Initial navigation redirected outside the original origin.');
      const records = new Map<string, ExtractedRecord>();
      const sourcesUsed: Record<string, number> = {};
      let result: PlanExecutionResult | undefined;
      for (let action = 0; action <= env.EXTRACTION_MAX_ACTIONS; action++) {
        await page
          .waitForFunction(
            `(selector) => {
              return Array.from(document.querySelectorAll(selector)).some((element) =>
                Boolean(
                  element.textContent?.trim() ||
                    ['content', 'href', 'src', 'alt', 'aria-label'].some((name) =>
                      element.getAttribute(name)?.trim()
                    )
                )
              );
            }`,
            plan.readySelector,
            {
              timeout: Math.min(
                env.PLAYWRIGHT_TIMEOUT_MS,
                Math.max(1, budgetMs - (Date.now() - started))
              ),
            }
          )
          .catch(() => {});
        const rawHtml = await page.content();
        detectAntiBotBlock(page.url(), rawHtml, response?.status() ?? 200);
        const extracted = extractPlanPage(rawHtml, page.url(), plan);
        for (const [source, count] of Object.entries(extracted.report.sourcesUsed))
          sourcesUsed[source] = (sourcesUsed[source] ?? 0) + count;
        result = {
          data: extracted.data,
          report: {
            ...extracted.report,
            pagesVisited: action + 1,
            sourcesUsed: { ...sourcesUsed },
          },
          scrape: {
            rawHtml,
            url: page.url(),
            httpStatus: response?.status() ?? 200,
            durationMs: Date.now() - started,
          },
        };
        if (!isAcceptedExtractionQuality(result.report.quality)) return result;
        const items = (extracted.data as { items: ExtractedRecord[] }).items;
        for (const item of items) {
          const key = recordIdentity(item, plan.identityFields);
          if (records.has(key) && JSON.stringify(records.get(key)) !== JSON.stringify(item)) {
            result.report.quality = ExtractionQuality.Invalid;
            result.report.issues.push('Conflicting duplicate collection identity.');
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
          recordIdentity(a, plan.identityFields).localeCompare(
            recordIdentity(b, plan.identityFields)
          )
        );
        result.data = { items: ordered, count: ordered.length };
        if (records.size > env.EXTRACTION_MAX_ITEMS) break;
        if (extracted.ended) {
          result.report.quality = records.size
            ? ExtractionQuality.Complete
            : ExtractionQuality.Empty;
          if (options.captureScreenshot)
            result.scrape.screenshot = await page.screenshot({ type: 'jpeg' });
          return result;
        }
        if (action === env.EXTRACTION_MAX_ACTIONS || action + 1 >= env.EXTRACTION_MAX_PAGES) break;
        const previousIdentities = new Set(records.keys());
        if (plan.pagination?.kind === PaginationKind.Scroll)
          await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        else await page.locator(plan.pagination!.nextSelector!).first().click();
        const progressDeadline = Math.min(
          started + budgetMs,
          Date.now() + env.PLAYWRIGHT_TIMEOUT_MS
        );
        while (Date.now() < progressDeadline) {
          const currentUrl = page.url();
          const currentHtml = await page.content().catch(() => '');
          if (currentHtml) {
            const current = extractPlanPage(currentHtml, currentUrl, plan);
            const currentItems =
              'items' in current.data && Array.isArray(current.data.items)
                ? current.data.items
                : [];
            const hasNewIdentity =
              isAcceptedExtractionQuality(current.report.quality) &&
              currentItems.some(
                (item) => !previousIdentities.has(recordIdentity(item, plan.identityFields))
              );
            if (hasNewIdentity || current.ended) break;
          }
          try {
            await page.waitForTimeout(200);
          } catch {
            break;
          }
        }
      }
      if (!result) throw new Error('Interactive extraction produced no document.');
      result.report.quality = ExtractionQuality.Partial;
      result.report.issues.push(
        'Collection completion was not verified within the configured limits.'
      );
      return result;
    } finally {
      clearTimeout(timer);
      await context?.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  async fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    const safeTargetUrl = await assertSafeUrl(targetUrl, 'targetUrl');
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = Date.now();

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      browser = await launchBrowserWithFallback({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-size=1920,1080',
        ],
        ...(env.HTTP_PROXY ? { proxy: { server: env.HTTP_PROXY } } : {}),
      });

      context = await browser.newContext({
        userAgent: DEFAULT_USER_AGENT,
        viewport: { width: 1366, height: 768 },
        locale: 'pt-BR',
        ...(options?.storageState ? { storageState: options.storageState } : {}),
        extraHTTPHeaders: {
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'sec-ch-ua': '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      // Mask automation fingerprint (stealth properties)
      await context.addInitScript(() => {
        const globalTarget = globalThis as unknown as {
          navigator?: Record<string, unknown>;
          chrome?: Record<string, unknown>;
        };

        if (typeof globalTarget.navigator !== 'undefined') {
          Object.defineProperty(globalTarget.navigator, 'webdriver', { get: () => undefined });
          Object.defineProperty(globalTarget.navigator, 'languages', {
            get: () => ['pt-BR', 'pt', 'en-US', 'en'],
          });
          Object.defineProperty(globalTarget.navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
          });
        }

        globalTarget.chrome = {
          runtime: {},
          loadTimes: () => {},
          csi: () => {},
          app: {},
        };
      });

      const page = await context.newPage();
      page.setDefaultNavigationTimeout(timeoutMs);
      page.setDefaultTimeout(timeoutMs);

      // Abort heavy media downloads to preserve VPS RAM and bandwidth
      await page.route('**/*', async (route) => {
        try {
          await assertSafeUrl(route.request().url(), 'requestUrl');
        } catch {
          return route.abort();
        }
        const resourceType = route.request().resourceType();
        if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
          return route.abort();
        }
        return route.continue();
      });

      let response;
      try {
        response = await page.goto(safeTargetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: timeoutMs,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('timeout')) {
          throw new NavigationTimeoutError(
            `Navigation timeout after ${timeoutMs}ms for URL: ${targetUrl}`,
            err
          );
        }
        throw err;
      }

      const httpStatus = response?.status() ?? 200;

      // 1. Ensure load event completes if possible (stylesheets, scripts)
      await page.waitForLoadState('load', { timeout: Math.min(6000, timeoutMs) }).catch(() => {});

      // 2. Network stabilization wait for SPA hydration
      await page
        .waitForLoadState('networkidle', { timeout: Math.min(5000, timeoutMs) })
        .catch(() => {});

      // 3. Generic accessibility stabilization: wait for W3C aria-busy to be cleared
      await page
        .waitForFunction('!document.querySelector(\'[aria-busy="true"]\')', null, {
          timeout: Math.min(3000, timeoutMs),
        })
        .catch(() => {});

      // 4. Target element attachment wait if specified, or wait for primary SPA content landmarks
      if (options?.waitForSelector) {
        await page
          .waitForSelector(options.waitForSelector, {
            state: 'attached',
            timeout: Math.min(8000, timeoutMs),
          })
          .catch(() => {});
      } else {
        await page
          .waitForSelector('main, article, h1, [role="main"]', {
            state: 'attached',
            timeout: Math.min(4000, timeoutMs),
          })
          .catch(() => {});
      }

      // Trigger IntersectionObserver lazy-hydrated components common in SPAs (Next.js/FastStore/Shopify)
      await page
        .evaluate(
          `
          (() => {
            window.scrollBy(0, 350);
            window.scrollTo(0, 0);
          })()
        `
        )
        .catch(() => {});

      // 5. DOM Mutation Quiescence (Universal language- and framework-agnostic stabilization)
      // Monitors active DOM mutations (React/Vue/Angular hydration, client-side fetches)
      // and resolves as soon as the DOM remains completely quiet for 500ms.
      await page
        .evaluate(
          `
          new Promise((resolve) => {
            let timeoutId;
            const quietWindowMs = 500;
            const maxWaitMs = 3500;

            const observer = new MutationObserver(() => {
              clearTimeout(timeoutId);
              timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve();
              }, quietWindowMs);
            });

            observer.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
              characterData: true,
            });

            timeoutId = setTimeout(() => {
              observer.disconnect();
              resolve();
            }, quietWindowMs);

            setTimeout(() => {
              observer.disconnect();
              resolve();
            }, maxWaitMs);
          })
        `
        )
        .catch(() => {});

      const rawHtml = await page.content();
      const finalUrl = page.url() || targetUrl;
      const durationMs = Date.now() - startTime;

      let screenshot: Buffer | undefined;
      if (options?.captureScreenshot) {
        try {
          if (options.waitForSelector) {
            const targetLocator = page.locator(options.waitForSelector).first();
            const isVisible = await targetLocator.isVisible({ timeout: 2500 }).catch(() => false);

            if (isVisible) {
              await targetLocator
                .evaluate((el) => {
                  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                })
                .catch(() => {});

              // Wait for any lazy-loaded images, fonts, or styles to paint
              await page.waitForTimeout(300);
            }
          }

          screenshot = await page.screenshot({
            type: 'jpeg',
            quality: 80,
            fullPage: false,
          });
        } catch {
          // Graceful fallback to viewport snapshot if targeted scroll fails
          screenshot = await page
            .screenshot({
              type: 'jpeg',
              quality: 80,
              fullPage: false,
            })
            .catch(() => undefined);
        }
      }

      // Check HTTP status code, URL redirects, and DOM challenge fingerprints
      detectAntiBotBlock(finalUrl, rawHtml, httpStatus);

      return {
        rawHtml,
        httpStatus,
        url: finalUrl,
        durationMs,
        screenshot,
      };
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}
