import { existsSync } from 'fs';
import { chromium, type Browser, type BrowserContext, type LaunchOptions } from 'playwright';
import { env } from '../../config/env.js';
import { NavigationTimeoutError } from '../../errors/domainErrors.js';
import { detectAntiBotBlock } from '../../utils/antiBotDetector.js';
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

  async fetchHtml(targetUrl: string, options?: ScrapeOptions): Promise<ScrapeResult> {
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
        viewport: { width: 1920, height: 1080 },
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
      await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
          return route.abort();
        }
        return route.continue();
      });

      let response;
      try {
        response = await page.goto(targetUrl, {
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
            const isVisible = await targetLocator.isVisible({ timeout: 1500 }).catch(() => false);

            if (isVisible) {
              await targetLocator
                .evaluate((el) => {
                  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                })
                .catch(() => {});

              // Brief wait for any lazy-loaded images or styles to paint
              await page.waitForTimeout(200);
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
