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
  ExtractionPlan,
  ExecutionContext,
  ExecutionPolicy,
  Locator,
  NetworkResponse,
} from '../contracts.js';
import { assertSafeUrl } from '../../utils/ssrfValidator.js';
import { detectAntiBotBlock } from '../../utils/antiBotDetector.js';

export class BrowserDocumentAdapter implements DocumentAdapter {
  constructor(
    private readonly policy: ExecutionPolicy,
    private readonly proxy?: string
  ) {}
  async open(
    url: string,
    plan: ExtractionPlan,
    execution: ExecutionContext,
    options: { storageState?: unknown }
  ): Promise<DocumentSession> {
    execution.check();
    const safeUrl = await assertSafeUrl(url, 'targetUrl');
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    const close = async () => {
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
    };
    const abort = () => {
      void close();
    };
    execution.signal.addEventListener('abort', abort, { once: true });
    try {
      browser = await chromium.launch({
        headless: true,
        timeout: Math.max(1, execution.remaining()),
        ...(this.proxy ? { proxy: { server: this.proxy } } : {}),
      });
      context = await browser.newContext({
        storageState: options.storageState as BrowserContextOptions['storageState'],
      });
      const origin = new URL(safeUrl).origin;
      await context.route('**/*', async (route) => {
        try {
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
        plan.strategy.document?.frame ? page.frameLocator(plan.strategy.document.frame) : page;
      const rootLocator = (selector: string) => {
        const root = documentRoot();
        return plan.strategy.document?.shadow
          ? root.locator(plan.strategy.document.shadow).locator(selector)
          : root.locator(selector);
      };
      const locate = (locator: Locator): BrowserLocator => {
        if (locator.kind === 'css') return rootLocator(locator.selector);
        const root = plan.strategy.document?.shadow
          ? documentRoot().locator(plan.strategy.document.shadow)
          : documentRoot();
        return root.getByRole(locator.role as Parameters<Page['getByRole']>[0], {
          name: locator.name,
          exact: locator.exact ?? true,
        });
      };
      const snapshot = async () => {
        execution.check();
        // Browser projection includes open shadow trees, which page.content() cannot serialize.
        const documentElement = plan.strategy.document?.shadow
          ? documentRoot().locator(plan.strategy.document.shadow)
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
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
        throw new NavigationTimeoutError('Browser navigation exceeded its budget.', error);
      throw error;
    }
  }
}
