import { parseRetryAfter } from '../../utils/retryAfter.js';
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
  type FrameLocator,
  type Locator as BrowserLocator,
} from 'playwright';
import type {
  Condition,
  DocumentAdapter,
  DocumentCapabilities,
  DocumentSession,
  DocumentRequest,
  DocumentSnapshot,
  DiscoveryAction,
  ExecutionContext,
  ExecutionPolicy,
  ExecutionStrategy,
  Locator,
  NetworkResponse,
} from '../contracts.js';
import { assertSafeUrl } from '../../utils/ssrfValidator.js';
import { buildChromeFingerprint } from '../../utils/chromeFingerprint.js';
import { detectAntiBotBlock } from '../../utils/antiBotDetector.js';
import { parseProxyConfig } from '../../utils/proxyParser.js';

export class BrowserDocumentSession implements DocumentSession {
  public readonly capabilities: DocumentCapabilities = browserCapabilities;
  private settled = false;

  constructor(
    private readonly page: Page,
    private readonly request: DocumentRequest,
    private readonly execution: ExecutionContext,
    private readonly policy: ExecutionPolicy,
    private readonly responses: NetworkResponse[],
    private readonly responseTasks: Set<Promise<void>>,
    private readonly getHttpStatus: () => number,
    private readonly cleanup: () => Promise<void>,
    private readonly getRetryAfter: () => number | undefined = () => undefined
  ) {}

  private timeout(): number {
    return Math.max(1, Math.min(this.execution.remaining(), this.policy.actionTimeoutMs));
  }

  private async ensureSettled(): Promise<void> {
    if (this.settled) return;
    this.settled = true;
    const idleTimeout = Math.max(1, Math.min(this.execution.remaining(), 20000));
    await this.page.waitForLoadState?.('networkidle', { timeout: idleTimeout })?.catch(() => {});
  }

  private documentRoot(): Page | FrameLocator {
    return this.request.strategy?.document?.frame
      ? this.page.frameLocator(this.request.strategy.document.frame)
      : this.page;
  }

  private rootLocator(selector: string): BrowserLocator {
    const root = this.documentRoot();
    return this.request.strategy?.document?.shadow
      ? root.locator(this.request.strategy.document.shadow).locator(selector)
      : root.locator(selector);
  }

  private locate(locator: Locator): BrowserLocator {
    if (locator.kind === 'css') {
      return this.rootLocator(locator.selector);
    }
    const root = this.request.strategy?.document?.shadow
      ? this.documentRoot().locator(this.request.strategy.document.shadow)
      : this.documentRoot();

    return root.getByRole(locator.role as Parameters<Page['getByRole']>[0], {
      name: locator.name,
      exact: locator.exact ?? true,
    });
  }

  private async click(locator: Locator): Promise<void> {
    const target = this.locate(locator);
    await target.first().waitFor({ state: 'attached', timeout: this.timeout() });

    if ((await target.count()) !== 1) {
      throw new Error('Interaction locator must select exactly one element.');
    }

    // Generated interactions may navigate/expand, but cannot submit forms.
    const unsafe = await target
      .first()
      .evaluate(
        (element) =>
          Boolean(element.closest('form')) && !['a'].includes(element.tagName.toLowerCase())
      );

    if (unsafe) {
      throw new Error('Form interactions are not supported.');
    }

    await target.first().click({ timeout: this.timeout() });
    const postClickTimeout = Math.max(1, Math.min(this.execution.remaining(), 15000));
    await this.page
      .waitForLoadState?.('networkidle', { timeout: postClickTimeout })
      ?.catch(() => {});
  }

  private async scroll(selector?: string): Promise<void> {
    if (selector) {
      await this.rootLocator(selector)
        .first()
        .evaluate((element) => element.scrollTo(0, element.scrollHeight));
    } else {
      await this.page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    }
  }

  async snapshot(): Promise<DocumentSnapshot> {
    this.execution.check();
    await this.ensureSettled();
    await Promise.allSettled([...this.responseTasks]);

    // Browser projection includes open shadow trees, which page.content() cannot serialize.
    const documentElement = this.request.strategy?.document?.shadow
      ? this.documentRoot().locator(this.request.strategy.document.shadow)
      : this.documentRoot().locator('html');

    const html = await documentElement.first().evaluate((element) => {
      const clone = element.cloneNode(true) as typeof element;
      const stack: Array<[typeof element, typeof element]> = [[element, clone]];
      while (stack.length > 0) {
        const [orig, copy] = stack.pop()!;
        const origChildren = Array.from(orig.children) as Array<typeof element>;
        const copyChildren = Array.from(copy.children) as Array<typeof element>;
        for (let i = 0; i < origChildren.length; i++) {
          const origChild = origChildren[i];
          const copyChild = copyChildren[i];
          if (origChild && copyChild) {
            stack.push([origChild, copyChild]);
          }
        }
        if (orig.shadowRoot) {
          for (const child of Array.from(orig.shadowRoot.children) as Array<typeof element>) {
            const childClone = child.cloneNode(true) as typeof element;
            copy.appendChild(childClone);
            stack.push([child, childClone]);
          }
        }
      }
      return clone.outerHTML;
    });

    const currentUrl = this.page.url();
    const httpStatus = this.getHttpStatus();
    detectAntiBotBlock(currentUrl, html, httpStatus);

    return {
      transport: Transport.Browser,
      html,
      url: currentUrl,
      httpStatus,
      retryAfterMs: this.getRetryAfter(),
      responses: [...this.responses],
    };
  }

  private async evaluateLiveCondition(condition: Condition): Promise<boolean | undefined> {
    if (condition.kind === 'field') return undefined;
    await this.ensureSettled();

    if (condition.kind === SourceKind.Response) {
      await Promise.allSettled([...this.responseTasks]);
      return evaluateCondition(
        condition,
        {
          html: '',
          url: this.page.url(),
          httpStatus: this.getHttpStatus(),
          responses: this.responses,
        },
        []
      );
    }

    const target = this.locate(condition.locator);
    if (condition.kind === 'exists') return (await target.count()) > 0;
    if (condition.kind === 'absent') return (await target.count()) === 0;
    if (!(await target.count())) return false;

    if (condition.kind === 'visible') {
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
    }

    if (condition.kind === 'disabled') {
      return target.evaluateAll((elements) =>
        elements.every(
          (element) =>
            element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true'
        )
      );
    }

    if (condition.kind === 'attribute') {
      return target.evaluateAll(
        (elements, cond) =>
          elements.some((element) => {
            const value = element.getAttribute(cond.attribute);
            return cond.value === undefined ? Boolean(value?.trim()) : value === cond.value;
          }),
        { attribute: condition.attribute, value: condition.value }
      );
    }

    return undefined;
  }

  async check(condition: Condition): Promise<boolean | undefined> {
    // Evaluate static conditions against the same snapshot as the records.
    if (
      condition.kind === SourceKind.Response ||
      ('locator' in condition && condition.locator.kind === 'css' && condition.kind !== 'visible')
    ) {
      return undefined;
    }

    return this.evaluateLiveCondition(condition);
  }

  async advance(pagination: NonNullable<ExecutionStrategy['pagination']>): Promise<void> {
    this.execution.check();
    if (pagination.kind === 'scroll') {
      await this.scroll(pagination.scrollTarget);
    } else {
      await this.click(pagination.next!);
    }
  }

  async discover(action: DiscoveryAction): Promise<DocumentSnapshot> {
    this.execution.check();

    if (action.kind === 'click') {
      await this.click(action.locator);
    } else if (action.kind === 'scroll') {
      await this.scroll(action.selector);
    } else if (action.kind === 'wait') {
      if (action.condition.kind === 'field') {
        throw new Error('Field conditions require a compiled extraction plan.');
      }
      const until = Date.now() + this.timeout();
      while (!(await this.evaluateLiveCondition(action.condition)) && Date.now() < until) {
        await this.page.waitForTimeout(this.policy.pollIntervalMs);
      }
    } else if (action.kind === 'inspect') {
      const locator = this.rootLocator(action.selector);
      let found: boolean;
      try {
        await locator
          .first()
          .waitFor({ state: 'attached', timeout: Math.min(this.timeout(), 3000) });
        found = (await locator.count()) > 0;
      } catch {
        found = false;
      }

      const inspected = await this.snapshot();
      if (found) {
        inspected.html = await locator.evaluateAll((elements) =>
          elements.map((element) => element.outerHTML).join('\n')
        );
      } else {
        inspected.html = `<!-- Observation: 0 elements matched selector '${action.selector}'. The selector does not exist in the rendered DOM. Choose a different selector based on the page HTML. -->`;
      }
      return inspected;
    }

    return this.snapshot();
  }

  async screenshot(): Promise<Buffer> {
    return this.page.screenshot({ type: 'jpeg', quality: 80, timeout: this.timeout() });
  }

  async close(): Promise<void> {
    await this.cleanup();
  }
}

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
      const proxyConfig = parseProxyConfig(this.proxy);

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
        ...(proxyConfig ? { proxy: proxyConfig } : {}),
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
      const page: Page = await context.newPage();

      await context.route('**/*', async (route) => {
        try {
          const resourceType = route.request().resourceType();
          if (['image', 'media', 'font'].includes(resourceType)) {
            return await route.abort();
          }
          const target = await assertSafeUrl(route.request().url(), 'requestUrl');
          if (
            route.request().isNavigationRequest() &&
            route.request().frame() === page.mainFrame() &&
            new URL(target).origin !== origin
          ) {
            return await route.abort();
          }
          await route.continue();
        } catch {
          await route.abort();
        }
      });

      const actionTimeout = Math.max(
        1,
        Math.min(execution.remaining(), this.policy.actionTimeoutMs)
      );
      const navTimeout = Math.max(
        1,
        Math.min(execution.remaining(), this.policy.navigationTimeoutMs)
      );
      page.setDefaultTimeout(actionTimeout);
      page.setDefaultNavigationTimeout(navTimeout);

      const responses: NetworkResponse[] = [];
      let httpStatus = 0;
      let retryAfterMs: number | undefined;
      let pendingBytes = 0;
      const responseTasks = new Set<Promise<void>>();

      page.on('response', (response) => {
        if (
          response.request().isNavigationRequest() &&
          response.request().frame() === page.mainFrame()
        ) {
          httpStatus = response.status();
          retryAfterMs = parseRetryAfter(response.headers()['retry-after'] ?? null);
        }

        if (!(response.headers()['content-type'] ?? '').includes('json')) {
          return;
        }

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
        timeout: navTimeout,
      });
      httpStatus = response?.status() ?? 200;
      retryAfterMs = parseRetryAfter(response?.headers()['retry-after'] ?? null);

      const cleanup = async () => {
        execution.signal.removeEventListener('abort', abort);
        await close();
      };

      return new BrowserDocumentSession(
        page,
        request,
        execution,
        this.policy,
        responses,
        responseTasks,
        () => httpStatus,
        cleanup,
        () => retryAfterMs
      );
    } catch (error) {
      execution.signal.removeEventListener('abort', abort);
      await close();
      if (isTimeoutError(error)) {
        throw new NavigationTimeoutError('Browser navigation exceeded its budget.', error);
      }
      throw error;
    }
  }
}
