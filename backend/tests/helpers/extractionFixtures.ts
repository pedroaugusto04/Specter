import { CompilerValidationError } from '../../src/errors/domainErrors.js';
import { standardSourceReaders } from '../../src/extraction/sources.js';
import type {
  ExtractionPlan,
  ExecutionPolicy,
  DocumentAdapter,
  IntentField,
  Source,
  TriggerRule,
} from '../../src/extraction/contracts.js';
import { ExtractionExecutor } from '../../src/extraction/executor.js';
import { PageExtractor } from '../../src/extraction/pageExtractor.js';
import { PlanExecutionService } from '../../src/services/planExecutionService.js';
import type {
  IScraperEngine,
  ScrapeOptions,
} from '../../src/providers/scraping/scraper.interface.js';
import type {
  ConfigurationRequest,
  IConfigurationPipeline,
} from '../../src/extraction/configuration.js';
import { buildCompilerEvidence } from '../../src/utils/compilerEvidence.js';
export interface FixtureCompilerInput {
  jobId: string;
  sanitizedHtml: string;
  userPrompt: string;
}
export interface FixtureCompiler {
  compile(input: FixtureCompilerInput): Promise<ExtractionPlan>;
}
interface FixtureField extends Partial<IntentField> {
  type: IntentField['type'];
  sources: Array<
    Exclude<Source, { kind: 'dom' }> | { kind: 'dom'; selector: string; attribute?: string }
  >;
}
interface FixtureInput {
  mode?: 'single' | 'collection';
  scope?: 'page' | 'collection';
  fields?: Record<string, FixtureField>;
  containerSelector?: string;
  jsonLdType?: string;
  readySelector?: string;
  emptySelector?: string;
  identityFields?: string[];
  triggerRules?: TriggerRule[];
  triggerMatchMode?: 'all' | 'any';
  pagination?: { kind: 'link' | 'click' | 'scroll'; nextSelector?: string; endSelector: string };
}
export function fixturePlan(input: FixtureInput = {}): ExtractionPlan {
  const fields = input.fields ?? {
    title: { type: 'string', sources: [{ kind: 'dom', selector: 'h1', attribute: 'text' }] },
  };
  return {
    version: 3,
    intent: {
      entity: 'Requested entity',
      mode: input.mode ?? 'single',
      scope: input.scope ?? 'page',
      fields: Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [
          key,
          {
            description: field.description ?? key,
            type: field.type,
            required: field.required ?? true,
            ...(field.locale ? { locale: field.locale } : {}),
            ...(field.booleanValues ? { booleanValues: field.booleanValues } : {}),
            ...(field.normalizeVolatileText !== undefined
              ? { normalizeVolatileText: field.normalizeVolatileText }
              : {}),
          },
        ])
      ),
      identityFields: input.identityFields ?? [],
      filters: [],
      triggerRules: input.triggerRules ?? [],
      triggerMatchMode: input.triggerMatchMode ?? 'all',
    },
    strategy: {
      transport: 'http',
      records: input.jsonLdType
        ? { kind: 'jsonld', type: input.jsonLdType }
        : { kind: 'dom', selector: input.containerSelector ?? 'body' },
      fields: Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [
          key,
          field.sources.map((source) =>
            source.kind === 'dom' ? { ...source, attribute: source.attribute ?? 'text' } : source
          ),
        ])
      ),
      ready: [
        { kind: 'exists', locator: { kind: 'css', selector: input.readySelector ?? 'body' } },
      ],
      empty: input.emptySelector
        ? [{ kind: 'exists', locator: { kind: 'css', selector: input.emptySelector } }]
        : [],
      ...(input.pagination
        ? {
            pagination: {
              kind: input.pagination.kind,
              next: input.pagination.nextSelector
                ? { kind: 'css' as const, selector: input.pagination.nextSelector }
                : undefined,
              end: [
                {
                  kind: 'exists' as const,
                  locator: { kind: 'css' as const, selector: input.pagination.endSelector },
                },
              ],
            },
          }
        : {}),
    },
  };
}
export const fixturePolicy: ExecutionPolicy = {
  timeoutMs: 5000,
  navigationTimeoutMs: 5000,
  actionTimeoutMs: 100,
  pollIntervalMs: 50,
  maxPages: 10,
  maxActions: 20,
  maxItems: 500,
  maxEvidence: 200,
};
export function fixtureExecutor(scraper: IScraperEngine) {
  return {
    execute: async (url: string, plan: ExtractionPlan, options: ScrapeOptions = {}) => {
      const adapter: DocumentAdapter = {
        open: async (target) => {
          const result = await scraper.fetchHtml(target, options);
          return {
            snapshot: async () => ({
              html: result.rawHtml,
              url: result.url,
              httpStatus: result.httpStatus,
              responses: [],
              screenshot: result.screenshot,
            }),
            check: async () => undefined,
            advance: async () => {},
            discover: async () => {
              throw new Error('This fixture does not support discovery.');
            },
            screenshot: async () => result.screenshot,
            close: async () => {},
          };
        },
      };
      return new PlanExecutionService(
        new ExtractionExecutor(
          { http: adapter, browser: adapter },
          new PageExtractor(standardSourceReaders()),
          fixturePolicy
        )
      ).execute(url, plan, options);
    },
  };
}
export function fixtureConfiguration(
  compiler: FixtureCompiler,
  scraper: IScraperEngine
): IConfigurationPipeline {
  return {
    configure: async (request: ConfigurationRequest) => {
      const fetched = await scraper.fetchHtml(request.url);
      const plan = await compiler.compile({
        jobId: request.jobId,
        userPrompt: request.prompt,
        sanitizedHtml: buildCompilerEvidence(fetched.rawHtml, 200000),
      });
      const result = await fixtureExecutor(scraper).execute(request.url, plan, {
        captureScreenshot: request.captureScreenshot,
      });
      if (!['COMPLETE', 'EMPTY'].includes(result.report.quality))
        throw new CompilerValidationError(result.report.issues.join(' '));
      return {
        plan,
        execution: {
          data: result.data,
          report: result.report,
          snapshot: {
            html: result.scrape.rawHtml,
            url: result.scrape.url,
            httpStatus: result.scrape.httpStatus,
            responses: [],
            screenshot: result.scrape.screenshot,
          },
        },
        semanticReview: { status: 'SKIPPED', score: null, reasons: [], evidenceRefs: [] },
        trace: [],
      };
    },
  };
}
