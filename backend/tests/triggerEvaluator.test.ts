import { NoopStorageProvider } from '../src/providers/storage/noopStorage.provider.js';
import { fixtureExecutor } from './helpers/extractionFixtures.js';
import { fixturePlan } from './helpers/extractionFixtures.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScrapeExecutionService } from '../src/services/scrapeExecutionService.js';
import type { ExtractionPlan, TriggerRule } from '../src/types/extractionPlan.js';
import {
  evaluateSingleRule,
  evaluateTriggerRules,
  parseBooleanValue,
  parseNumericValue,
} from '../src/utils/triggerEvaluator.js';
import {
  InMemoryJobRepository,
  MockJobScheduler,
  MockNotificationProvider,
  MockScraperEngine,
} from './helpers/testDoubles.js';
describe('Conditional Alert Triggers & Evaluator', () => {
  describe('parseNumericValue', () => {
    it('handles numeric primitives', () => {
      expect(parseNumericValue(150)).toBe(150);
      expect(parseNumericValue(3499.99)).toBe(3499.99);
      expect(parseNumericValue(-42)).toBe(-42);
      expect(parseNumericValue(NaN)).toBeNull();
      expect(parseNumericValue(Infinity)).toBeNull();
    });
    it('parses US currency strings correctly', () => {
      expect(parseNumericValue('$ 1,299.99')).toBe(1299.99);
      expect(parseNumericValue('$45')).toBe(45);
      expect(parseNumericValue('USD 10,000.50')).toBe(10000.5);
    });
    it('parses European and Brazilian currency strings correctly', () => {
      expect(parseNumericValue('R$ 3.500,00')).toBe(3500);
      expect(parseNumericValue('1.250,50 €')).toBe(1250.5);
      expect(parseNumericValue('€ 99,90')).toBe(99.9);
    });
    it('parses percentages correctly', () => {
      expect(parseNumericValue('25%')).toBe(25);
      expect(parseNumericValue('- 15.5 %')).toBe(-15.5);
    });
    it('returns null for non-numeric strings or empty values', () => {
      expect(parseNumericValue('')).toBeNull();
      expect(parseNumericValue('Out of stock')).toBeNull();
      expect(parseNumericValue(null)).toBeNull();
      expect(parseNumericValue(undefined)).toBeNull();
    });
  });
  describe('parseBooleanValue', () => {
    it('handles boolean primitives', () => {
      expect(parseBooleanValue(true)).toBe(true);
      expect(parseBooleanValue(false)).toBe(false);
    });
    it('identifies truthy stock / status keywords', () => {
      expect(parseBooleanValue('in stock')).toBe(true);
      expect(parseBooleanValue('Disponível')).toBe(true);
      expect(parseBooleanValue('AVAILABLE')).toBe(true);
      expect(parseBooleanValue('yes')).toBe(true);
      expect(parseBooleanValue('1')).toBe(true);
    });
    it('identifies falsy stock / status keywords', () => {
      expect(parseBooleanValue('out of stock')).toBe(false);
      expect(parseBooleanValue('Esgotado')).toBe(false);
      expect(parseBooleanValue('indisponível')).toBe(false);
      expect(parseBooleanValue('no')).toBe(false);
      expect(parseBooleanValue('0')).toBe(false);
    });
    it('returns null for arbitrary strings', () => {
      expect(parseBooleanValue('iPhone 16 Pro')).toBeNull();
      expect(parseBooleanValue('')).toBeNull();
    });
  });
  describe('evaluateSingleRule', () => {
    it('evaluates numeric comparisons (lt, lte, gt, gte)', () => {
      const ruleLt: TriggerRule = { field: 'price', operator: 'lt', value: 3500 };
      expect(evaluateSingleRule('R$ 3.499,00', ruleLt).satisfied).toBe(true);
      expect(evaluateSingleRule('R$ 3.500,00', ruleLt).satisfied).toBe(false);
      const ruleLte: TriggerRule = { field: 'price', operator: 'lte', value: 3500 };
      expect(evaluateSingleRule('R$ 3.500,00', ruleLte).satisfied).toBe(true);
      expect(evaluateSingleRule('R$ 3.501,00', ruleLte).satisfied).toBe(false);
      const ruleGt: TriggerRule = { field: 'discount', operator: 'gt', value: 20 };
      expect(evaluateSingleRule('25%', ruleGt).satisfied).toBe(true);
      expect(evaluateSingleRule('20%', ruleGt).satisfied).toBe(false);
      const ruleGte: TriggerRule = { field: 'discount', operator: 'gte', value: 20 };
      expect(evaluateSingleRule('20%', ruleGte).satisfied).toBe(true);
    });
    it('evaluates equality and boolean matches', () => {
      const ruleEqStatus: TriggerRule = { field: 'in_stock', operator: 'eq', value: true };
      expect(evaluateSingleRule('In Stock', ruleEqStatus).satisfied).toBe(true);
      expect(evaluateSingleRule('Out of Stock', ruleEqStatus).satisfied).toBe(false);
      const ruleNeqStatus: TriggerRule = {
        field: 'in_stock',
        operator: 'neq',
        value: 'Out of Stock',
      };
      expect(evaluateSingleRule('In Stock', ruleNeqStatus).satisfied).toBe(true);
      expect(evaluateSingleRule('out of stock', ruleNeqStatus).satisfied).toBe(false);
    });
    it('evaluates contains and not_contains string checks', () => {
      const ruleContains: TriggerRule = { field: 'title', operator: 'contains', value: 'Pro Max' };
      expect(evaluateSingleRule('Apple iPhone 16 Pro Max 256GB', ruleContains).satisfied).toBe(
        true
      );
      expect(evaluateSingleRule('Apple iPhone 16 Plus', ruleContains).satisfied).toBe(false);
      const ruleNotContains: TriggerRule = {
        field: 'title',
        operator: 'not_contains',
        value: 'Refurbished',
      };
      expect(evaluateSingleRule('Brand New PS5 Slim', ruleNotContains).satisfied).toBe(true);
      expect(evaluateSingleRule('Refurbished PS5 Slim', ruleNotContains).satisfied).toBe(false);
    });
    it('evaluates relative percentage drops and increases against previous value', () => {
      const ruleDrop10: TriggerRule = { field: 'price', operator: 'percentage_drop', value: 10 };
      // Previous: 1000, Actual: 850 (15% drop >= 10%)
      expect(evaluateSingleRule('R$ 850,00', ruleDrop10, 'R$ 1.000,00').satisfied).toBe(true);
      // Previous: 1000, Actual: 950 (5% drop < 10%)
      expect(evaluateSingleRule('R$ 950,00', ruleDrop10, 'R$ 1.000,00').satisfied).toBe(false);
      // Price increased
      expect(evaluateSingleRule('R$ 1.100,00', ruleDrop10, 'R$ 1.000,00').satisfied).toBe(false);
      const ruleInc15: TriggerRule = { field: 'price', operator: 'percentage_increase', value: 15 };
      // Previous: 100, Actual: 120 (20% increase >= 15%)
      expect(evaluateSingleRule(120, ruleInc15, 100).satisfied).toBe(true);
      // Previous: 100, Actual: 110 (10% increase < 15%)
      expect(evaluateSingleRule(110, ruleInc15, 100).satisfied).toBe(false);
    });
    it('evaluates simple relative changes (decreased, increased, changes)', () => {
      const ruleDec: TriggerRule = { field: 'price', operator: 'decreased', value: '' };
      expect(evaluateSingleRule(90, ruleDec, 100).satisfied).toBe(true);
      expect(evaluateSingleRule(100, ruleDec, 100).satisfied).toBe(false);
      expect(evaluateSingleRule(110, ruleDec, 100).satisfied).toBe(false);
      const ruleInc: TriggerRule = { field: 'price', operator: 'increased', value: '' };
      expect(evaluateSingleRule(110, ruleInc, 100).satisfied).toBe(true);
      expect(evaluateSingleRule(90, ruleInc, 100).satisfied).toBe(false);
      const ruleChanges: TriggerRule = { field: 'status', operator: 'changes', value: '' };
      expect(evaluateSingleRule('In Stock', ruleChanges, 'Out of Stock').satisfied).toBe(true);
      expect(evaluateSingleRule('In Stock', ruleChanges, 'in stock').satisfied).toBe(false);
    });
  });
  describe('evaluateTriggerRules', () => {
    it('returns triggered: true when no rules are configured (default change alert behavior)', () => {
      const result = evaluateTriggerRules({ price: 100 }, []);
      expect(result.triggered).toBe(true);
      expect(result.hasRules).toBe(false);
      expect(result.matchedRules).toHaveLength(0);
    });
    it('returns triggered: true when rules are satisfied with matchMode: all', () => {
      const rules: TriggerRule[] = [
        { field: 'price', operator: 'lt', value: 3500 },
        { field: 'status', operator: 'eq', value: 'Available' },
      ];
      const payload = { price: 'R$ 3.200,00', status: 'Available' };
      const result = evaluateTriggerRules(payload, rules, 'all');
      expect(result.triggered).toBe(true);
      expect(result.matchedRules).toHaveLength(2);
      expect(result.reasons).toHaveLength(2);
    });
    it('returns triggered: false when any rule fails in matchMode: all', () => {
      const rules: TriggerRule[] = [
        { field: 'price', operator: 'lt', value: 3500 },
        { field: 'status', operator: 'eq', value: 'Available' },
      ];
      const payload = { price: 'R$ 3.800,00', status: 'Available' };
      const result = evaluateTriggerRules(payload, rules, 'all');
      expect(result.triggered).toBe(false);
      expect(result.matchedRules).toHaveLength(0);
    });
    it('returns triggered: true in matchMode: any when at least one rule matches', () => {
      const rules: TriggerRule[] = [
        { field: 'price', operator: 'lt', value: 3500 },
        { field: 'discount', operator: 'gte', value: 30 },
      ];
      // price is not < 3500, but discount is 35%
      const payload = { price: 'R$ 4.000,00', discount: '35%' };
      const result = evaluateTriggerRules(payload, rules, 'any');
      expect(result.triggered).toBe(true);
      expect(result.matchedRules).toHaveLength(1);
      expect(result.reasons[0]).toContain('discount (35) >= 30');
    });
    it('evaluates rules across list payload (items array)', () => {
      const rules: TriggerRule[] = [{ field: 'price', operator: 'lt', value: 50 }];
      const payload = {
        items: [
          { title: 'Item A', price: '$ 80.00' },
          { title: 'Item B', price: '$ 45.00' },
        ],
        count: 2,
      };
      const result = evaluateTriggerRules(payload, rules, 'all', null, ['title']);
      expect(result.triggered).toBe(true);
      expect(result.matchedRules).toHaveLength(1);
      expect(result.reasons[0]).toContain('price (45) < 50');
    });
  });
  describe('ScrapeExecutionService with Trigger Rules', () => {
    let repository: InMemoryJobRepository;
    let scraper: MockScraperEngine;
    let notifier: MockNotificationProvider;
    let scheduler: MockJobScheduler;
    let scrapeService: ScrapeExecutionService;
    beforeEach(() => {
      repository = new InMemoryJobRepository();
      scraper = new MockScraperEngine();
      notifier = new MockNotificationProvider();
      scheduler = new MockJobScheduler();
      scrapeService = new ScrapeExecutionService({
        jobRepository: repository,
        planExecutor: fixtureExecutor(scraper),
        alertRouter: notifier,
        storageProvider: new NoopStorageProvider(),
        jobScheduler: scheduler,
      });
    });
    it('suppresses notification if content changed but trigger rule is NOT met', async () => {
      const extractionPlan: ExtractionPlan = fixturePlan({
        mode: 'single',
        readySelector: 'body',
        scope: 'page',
        identityFields: [],
        triggerMatchMode: 'all',
        fields: {
          title: {
            sources: [{ kind: 'dom', selector: 'h1', attribute: 'text' }],
            type: 'string',
            required: true,
            locale: 'en-US',
          },
          price: {
            sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
            type: 'string',
            required: true,
            locale: 'en-US',
          },
        },
        triggerRules: [{ field: 'price', operator: 'lt', value: 3500 }],
      });
      const job = await repository.createJob({
        url: 'https://store.example.com/ps5',
        userPrompt: 'Alert if PS5 price drops below 3500',
        notificationEmail: 'user@example.com',
        cronExpression: '0 */6 * * *',
      });
      await repository.updateJob(job.id, {
        extractionPlan,
        status: 'ACTIVE',
      });
      // Initial run: price was 4200
      await repository.createRun({
        jobId: job.id,
        extractedData: { title: 'PlayStation 5', price: 'R$ 4.200,00' },
        normalizedHash: 'hash_initial',
        hasChanges: 'INITIAL',
        status: 'SUCCESS',
        httpStatus: 200,
        durationMs: 40,
      });
      // New scrape execution: price changed from 4200 to 3900 (still not < 3500)
      scraper.setHandler(async () => ({
        rawHtml: `<h1>PlayStation 5</h1><span class="price">R$ 3.900,00</span>`,
        httpStatus: 200,
        url: job.url,
        durationMs: 25,
      }));
      const run = await scrapeService.executeScrape(job.id);
      expect(run).not.toBeNull();
      expect(run?.hasChanges).toBe('YES');
      // Notification should be suppressed because price is 3900 (not < 3500)
      expect(repository.pendingDeliveries.map((delivery) => delivery.payload)).toHaveLength(0);
    });
    it('dispatches notification with triggerReasons when content changed and trigger rule IS met', async () => {
      const extractionPlan: ExtractionPlan = fixturePlan({
        mode: 'single',
        readySelector: 'body',
        scope: 'page',
        identityFields: [],
        triggerMatchMode: 'all',
        fields: {
          title: {
            sources: [{ kind: 'dom', selector: 'h1', attribute: 'text' }],
            type: 'string',
            required: true,
            locale: 'en-US',
          },
          price: {
            sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
            type: 'string',
            required: true,
            locale: 'en-US',
          },
        },
        triggerRules: [{ field: 'price', operator: 'lt', value: 3500 }],
      });
      const job = await repository.createJob({
        url: 'https://store.example.com/ps5',
        userPrompt: 'Alert if PS5 price drops below 3500',
        notificationEmail: 'user@example.com',
        cronExpression: '0 */6 * * *',
      });
      await repository.updateJob(job.id, {
        extractionPlan,
        status: 'ACTIVE',
      });
      // Initial run: price was 4200
      await repository.createRun({
        jobId: job.id,
        extractedData: { title: 'PlayStation 5', price: 'R$ 4.200,00' },
        normalizedHash: 'hash_initial',
        hasChanges: 'INITIAL',
        status: 'SUCCESS',
        httpStatus: 200,
        durationMs: 40,
      });
      // New scrape execution: price dropped to 3399 (satisfies price < 3500)
      scraper.setHandler(async () => ({
        rawHtml: `<h1>PlayStation 5</h1><span class="price">R$ 3.399,00</span>`,
        httpStatus: 200,
        url: job.url,
        durationMs: 25,
      }));
      const run = await scrapeService.executeScrape(job.id);
      expect(run).not.toBeNull();
      expect(run?.hasChanges).toBe('YES');
      // Notification must be dispatched with triggerReasons
      expect(repository.pendingDeliveries.map((delivery) => delivery.payload)).toHaveLength(1);
      const alert = repository.pendingDeliveries.map((delivery) => delivery.payload)[0]!;
      expect(alert.jobId).toBe(job.id);
      expect(alert.triggerReasons).toBeDefined();
      expect(alert.triggerReasons?.[0]).toContain('price (3399) < 3500');
    });
    it('evaluates relative triggers (percentage_drop) in ScrapeExecutionService', async () => {
      const extractionPlan: ExtractionPlan = fixturePlan({
        mode: 'single',
        readySelector: 'body',
        scope: 'page',
        identityFields: [],
        triggerMatchMode: 'all',
        fields: {
          title: {
            sources: [{ kind: 'dom', selector: 'h1', attribute: 'text' }],
            type: 'string',
            required: true,
            locale: 'en-US',
          },
          price: {
            sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
            type: 'string',
            required: true,
            locale: 'en-US',
          },
        },
        triggerRules: [{ field: 'price', operator: 'percentage_drop', value: 10 }],
      });
      const job = await repository.createJob({
        url: 'https://store.example.com/ps5',
        userPrompt: 'Alert if PS5 price drops by 10% or more',
        notificationEmail: 'user@example.com',
        cronExpression: '0 */6 * * *',
      });
      await repository.updateJob(job.id, {
        extractionPlan,
        status: 'ACTIVE',
      });
      // Prior run: price was 1000
      await repository.createRun({
        jobId: job.id,
        extractedData: { title: 'Headphones', price: 'R$ 1.000,00' },
        normalizedHash: 'hash_prior',
        hasChanges: 'INITIAL',
        status: 'SUCCESS',
        httpStatus: 200,
        durationMs: 40,
      });
      // Case 1: drops from 1000 to 950 (5% drop < 10% threshold) -> suppressed
      scraper.setHandler(async () => ({
        rawHtml: `<h1>Headphones</h1><span class="price">R$ 950,00</span>`,
        httpStatus: 200,
        url: job.url,
        durationMs: 25,
      }));
      await scrapeService.executeScrape(job.id);
      expect(repository.pendingDeliveries.map((delivery) => delivery.payload)).toHaveLength(0);
      // Case 2: drops from 950 to 800 (15.8% drop >= 10% threshold) -> triggers alert
      scraper.setHandler(async () => ({
        rawHtml: `<h1>Headphones</h1><span class="price">R$ 800,00</span>`,
        httpStatus: 200,
        url: job.url,
        durationMs: 25,
      }));
      await scrapeService.executeScrape(job.id);
      expect(repository.pendingDeliveries.map((delivery) => delivery.payload)).toHaveLength(1);
      expect(
        repository.pendingDeliveries.map((delivery) => delivery.payload)[0]!.triggerReasons?.[0]
      ).toContain('dropped by');
    });
  });
});
