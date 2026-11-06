import { isTimeoutError } from '../../utils/networkErrors.js';
import type { IBrowserCapacity } from '../../resources/browserCapacity.js';
import { browserCapabilities } from '../capabilities.js';
import { SourceKind, Transport } from '../constants.js';
import { evaluateCondition } from '../conditions.js';
import { NavigationTimeoutError } from '../../errors/domainErrors.js';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type Locator as BrowserLocator,
} from 'playwright';
import type {
  Condition,
  DocumentAdapter,
  DocumentSession,
  DocumentRequest,
  ExecutionContext,
  ExecutionPolicy,
  Locator,
  NetworkResponse,
} from '../contracts.js';
import { assertSafeUrl } from '../../utils/ssrfValidator.js';
import { buildChromeFingerprint } from '../../utils/chromeFingerprint.js';
import { detectAntiBotBlock } from '../../utils/antiBotDetector.js';

export class BrowserDocumentAdapter implements DocumentAdapter {
  constructor(
    private readonly policy: ExecutionPolicy,
    private readonly capacity: IBrowserCapacity,
    private readonly proxy?: string
  ) {}
  async open(
    url: string,
    request: DocumentRequest,
    execution: ExecutionContext,
    options: { storageState?: unknown }
  ): Promise<DocumentSession> {
    execution.check();
    const safeUrl = await assertSafeUrl(url, 'targetUrl');
    const permit = await this.capacity.acquire(execution);
    const original = execution;
    const signal = AbortSignal.any([original.signal, permit.signal]);
    execution = {
      ...original,
      signal,
      check: () => {
        original.check();
        signal.throwIfAborted();
      },
    };
    let browser: Browser | undefined;
    let launch: Promise<Browser> | undefined;
    let closing: Promise<void> | undefined;
    let context: BrowserContext | undefined;
    const close = () => {
      closing ??= (async () => {
        // Cancellation during launch must await and close the browser before releasing capacity.
        const launched = browser ?? (await launch?.catch(() => undefined));
        try {
          await context?.close().catch(() => {});
        } finally {
          try {
            await launched?.close().catch(() => {});
          } finally {
            await permit.release();
          }
        }
      })();
      return closing;
    };
    const abort = () => {
      void close().catch(() => {});
    };
    execution.signal.addEventListener('abort', abort, { once: true });
    try {
      execution.check();
      launch = chromium.launch({
        headless: true,
        timeout: Math.max(1, execution.remaining()),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-size=1920,1080',
        ],
        ...(this.proxy ? { proxy: { server: this.proxy } } : {}),
      });
      browser = await launch;
      execution.check();
      const fingerprint = buildChromeFingerprint(browser.version());
      context = await browser.newContext({
        storageState: options.storageState as BrowserContextOptions['storageState'],
        userAgent: fingerprint.userAgent,
        viewport: { width: 1920, height: 1080 },
        locale: 'pt-BR',
        extraHTTPHeaders: {
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'sec-ch-ua': fingerprint.secChUa,
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'Upgrade-Insecure-Requests': '1',
        },
      });
      execution.check();
      // Mask automation fingerprint so anti-bot systems cannot detect headless Chromium.
      await context.addInitScript(() => {
        const g = globalThis as unknown as {
          navigator?: Record<string, unknown>;
          chrome?: Record<string, unknown>;
        };
        if (typeof g.navigator !== 'undefined') {
          Object.defineProperty(g.navigator, 'webdriver', { get: () => undefined });
          Object.defineProperty(g.navigator, 'languages', {
            get: () => ['pt-BR', 'pt', 'en-US', 'en'],
          });
          Object.defineProperty(g.navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        }
        g.chrome = {
          runtime: {},
          loadTimes: () => {},
          csi: () => {},
          app: {},
        };
      });
      execution.check();
      const origin = new URL(safeUrl).origin;
      await context.route('**/*', async (route) => {
        try {
          // Abort heavy media downloads to preserve VPS RAM and bandwidth.
          const resourceType = route.request().resourceType();
          if (['image', 'media', 'font'].includes(resourceType)) {
            return await route.abort();
          }
          const target = await assertSafeUrl(route.request().url(), 'requestUrl');
          if (
            route.request().isNavigationRequest() &&
            route.request().frame() === page.mainFrame() &&
            new URL(target).origin !== origin
          )
            return await route.abort();
          await route.continue();
        } catch {
          await route.abort();
        }
      });
      const page: Page = await context.newPage();
      const timeout = () =>
        Math.max(1, Math.min(execution.remaining(), this.policy.actionTimeoutMs));
      page.setDefaultTimeout(timeout());
      page.setDefaultNavigationTimeout(
        Math.max(1, Math.min(execution.remaining(), this.policy.navigationTimeoutMs))
      );
      const responses: NetworkResponse[] = [];
      let httpStatus = 0;
      let pendingBytes = 0;
      const responseTasks = new Set<Promise<void>>();
      page.on('response', (response) => {
        if (
          response.request().isNavigationRequest() &&
          response.request().frame() === page.mainFrame()
        )
          httpStatus = response.status();
        if (
          responses.length + responseTasks.size >= 20 ||
          !(response.headers()['content-type'] ?? '').includes('json')
        )
          return;
        const task = (async () => {
          try {
            const declared = Number(response.headers()['content-length'] ?? 0);
            if (declared > 2_000_000 || pendingBytes >= 4_000_000) return;
            const buffer = await response.body();
            if (buffer.length > 2_000_000 || pendingBytes + buffer.length > 4_000_000) return;
            pendingBytes += buffer.length;
            responses.push({
              url: response.url(),
              method: response.request().method(),
              status: response.status(),
              body: JSON.parse(buffer.toString('utf8')),
            });
          } catch {
            /* incomplete/non-JSON responses cannot supply extraction evidence */
          }
        })();
        responseTasks.add(task);
        void task.finally(() => responseTasks.delete(task));
      });
      const response = await page.goto(safeUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Math.max(1, Math.min(execution.remaining(), this.policy.navigationTimeoutMs)),
      });
      httpStatus = response?.status() ?? 200;
      const documentRoot = () =>
        request.strategy?.document?.frame
          ? page.frameLocator(request.strategy?.document.frame)
          : page;
      const rootLocator = (selector: string) => {
        const root = documentRoot();
        return request.strategy?.document?.shadow
          ? root.locator(request.strategy?.document.shadow).locator(selector)
          : root.locator(selector);
      };
      const locate = (locator: Locator): BrowserLocator => {
        if (locator.kind === 'css') return rootLocator(locator.selector);
        const root = request.strategy?.document?.shadow
          ? documentRoot().locator(request.strategy?.document.shadow)
          : documentRoot();
        return root.getByRole(locator.role as Parameters<Page['getByRole']>[0], {
          name: locator.name,
          exact: locator.exact ?? true,
        });
      };
      const snapshot = async () => {
        execution.check();
        // Browser projection includes open shadow trees, which page.content() cannot serialize.
        const documentElement = request.strategy?.document?.shadow
          ? documentRoot().locator(request.strategy?.document.shadow)
          : documentRoot().locator('html');
        const html = await documentElement.first().evaluate((element) => {
          const cloneTree = (node: typeof element): typeof element => {
            const clone = node.cloneNode(true) as typeof element;
            const attachShadows = (original: typeof element, copy: typeof element) => {
              Array.from(original.children).forEach((child, index) => {
                attachShadows(child as typeof element, copy.children[index] as typeof element);
              });
              if (original.shadowRoot)
                for (const child of Array.from(original.shadowRoot.children))
                  copy.appendChild(cloneTree(child as typeof element));
            };
            attachShadows(node, clone);
            return clone;
          };
          return cloneTree(element).outerHTML;
        });
        const currentUrl = page.url();
        detectAntiBotBlock(currentUrl, html, httpStatus);
        return {
          transport: Transport.Browser,
          html,
          url: currentUrl,
          httpStatus,
          responses: [...responses],
        };
      };
      const check = async (condition: Condition): Promise<boolean | undefined> => {
        if (condition.kind === 'field') return undefined;
        if (condition.kind === SourceKind.Response)
          return evaluateCondition(
            condition,
            { html: '', url: page.url(), httpStatus, responses },
            []
          );
        const target = locate(condition.locator);
        if (condition.kind === 'exists') return (await target.count()) > 0;
        if (condition.kind === 'absent') return (await target.count()) === 0;
        if (!(await target.count())) return false;
        if (condition.kind === 'visible')
          return target.evaluateAll((elements) =>
            elements.some((element) => {
              const style = element.ownerDocument.defaultView?.getComputedStyle(element);
              return Boolean(
                element.getClientRects().length &&
                style?.visibility !== 'hidden' &&
                style?.display !== 'none'
              );
            })
          );
        if (condition.kind === 'disabled')
          return target.evaluateAll((elements) =>
            elements.every(
              (element) =>
                element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true'
            )
          );
        if (condition.kind === 'attribute')
          return target.evaluateAll(
            (elements, condition) =>
              elements.some((element) => {
                const value = element.getAttribute(condition.attribute);
                return condition.value === undefined
                  ? Boolean(value?.trim())
                  : value === condition.value;
              }),
            { attribute: condition.attribute, value: condition.value }
          );
        return undefined;
      };
      const click = async (locator: Locator) => {
        const target = locate(locator);
        await target.first().waitFor({ state: 'attached', timeout: timeout() });
        if ((await target.count()) !== 1)
          throw new Error('Interaction locator must select exactly one element.');
        // Generated interactions may navigate/expand, but cannot submit forms.
        const unsafe = await target
          .first()
          .evaluate(
            (element) =>
              Boolean(element.closest('form')) && !['a'].includes(element.tagName.toLowerCase())
          );
        if (unsafe) throw new Error('Form interactions are not supported.');
        await target.first().click({ timeout: timeout() });
      };
      const scroll = async (selector?: string) => {
        if (selector)
          await rootLocator(selector)
            .first()
            .evaluate((element) => element.scrollTo(0, element.scrollHeight));
        else await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      };
      return {
        capabilities: browserCapabilities,
        snapshot,
        check: async (condition) => {
          // Evaluate static conditions against the same snapshot as the records.
          if (
            condition.kind === SourceKind.Response ||
            ('locator' in condition &&
              condition.locator.kind === 'css' &&
              condition.kind !== 'visible')
          )
            return undefined;
          return check(condition);
        },
        advance: async (pagination) => {
          execution.check();
          if (pagination.kind === 'scroll') await scroll(pagination.scrollTarget);
          else await click(pagination.next!);
        },
        discover: async (action) => {
          execution.check();
          if (action.kind === 'click') await click(action.locator);
          if (action.kind === 'scroll') await scroll(action.selector);
          if (action.kind === 'wait') {
            if (action.condition.kind === 'field')
              throw new Error('Field conditions require a compiled extraction plan.');
            const until = Date.now() + timeout();
            while (!(await check(action.condition)) && Date.now() < until)
              await page.waitForTimeout(this.policy.pollIntervalMs);
          }
          if (action.kind === 'inspect') {
            await rootLocator(action.selector)
              .first()
              .waitFor({ state: 'attached', timeout: timeout() });
            const inspected = await snapshot();
            inspected.html = await rootLocator(action.selector).evaluateAll((elements) =>
              elements.map((element) => element.outerHTML).join('\n')
            );
            return inspected;
          }
          return snapshot();
        },
        screenshot: async () => page.screenshot({ type: 'jpeg', quality: 80, timeout: timeout() }),
        close: async () => {
          execution.signal.removeEventListener('abort', abort);
          await close();
        },
      };
    } catch (error) {
      execution.signal.removeEventListener('abort', abort);
      await close();
      if (isTimeoutError(error))
        throw new NavigationTimeoutError('Browser navigation exceeded its budget.', error);
      throw error;
    }
  }
}
