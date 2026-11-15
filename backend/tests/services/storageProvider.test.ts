import { fixtureExecutor } from '../helpers/extractionFixtures.js';
import { fixturePlan } from '../helpers/extractionFixtures.js';
import { describe, expect, it, vi } from 'vitest';
import {
  NoopStorageProvider,
  SupabaseStorageProvider,
  createStorageProvider,
} from '../../src/providers/storage/index.js';
import { ScrapeExecutionService } from '../../src/services/scrapeExecutionService.js';
import {
  InMemoryJobRepository,
  MockJobScheduler,
  MockNotificationProvider,
  MockScraperEngine,
} from '../helpers/testDoubles.js';
describe('Storage Providers & Supabase Object Storage Integration', () => {
  it('NoopStorageProvider is disabled and returns empty publicUrl', async () => {
    const provider = new NoopStorageProvider();
    expect(provider.isEnabled).toBe(false);
    const result = await provider.upload('test/key.jpg', Buffer.from('fake-image-bytes'));
    expect(result.publicUrl).toBe('');
    expect(provider.getPublicUrl('test/key.jpg')).toBe('');
  });
  it('SupabaseStorageProvider is disabled when config is missing', () => {
    const provider = new SupabaseStorageProvider({
      url: '',
      serviceRoleKey: '',
    });
    expect(provider.isEnabled).toBe(false);
    expect(provider.getPublicUrl('jobs/123/run.jpg')).toBe('');
  });
  it('SupabaseStorageProvider uploads buffer and returns publicUrl on success', async () => {
    const mockUpload = vi
      .fn()
      .mockResolvedValue({ data: { path: 'jobs/job-1/img.jpg' }, error: null });
    const mockGetPublicUrl = vi.fn().mockReturnValue({
      data: {
        publicUrl:
          'https://xyz.supabase.co/storage/v1/object/public/specter-screenshots/jobs/job-1/img.jpg',
      },
    });
    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          upload: mockUpload,
          getPublicUrl: mockGetPublicUrl,
        }),
      },
    } as unknown;
    const mockFactory = vi.fn().mockReturnValue(mockClient);
    const provider = new SupabaseStorageProvider(
      {
        url: 'https://xyz.supabase.co',
        serviceRoleKey: 'mock-service-role-key',
        bucket: 'specter-screenshots',
      },
      mockFactory as never
    );
    expect(provider.isEnabled).toBe(true);
    const fakeBuffer = Buffer.from('fake-jpeg-data');
    const result = await provider.upload('jobs/job-1/img.jpg', fakeBuffer, 'image/jpeg');
    expect(mockUpload).toHaveBeenCalledWith('jobs/job-1/img.jpg', fakeBuffer, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    });
    expect(result.publicUrl).toBe(
      'https://xyz.supabase.co/storage/v1/object/public/specter-screenshots/jobs/job-1/img.jpg'
    );
  });
  it('SupabaseStorageProvider throws formatted error when upload fails', async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Bucket not found or permission denied' },
    });
    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          upload: mockUpload,
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
        }),
      },
    } as unknown;
    const provider = new SupabaseStorageProvider(
      {
        url: 'https://xyz.supabase.co',
        serviceRoleKey: 'mock-key',
        bucket: 'specter-screenshots',
      },
      () => mockClient as never
    );
    await expect(
      provider.upload('jobs/job-1/img.jpg', Buffer.from('data'), 'image/jpeg')
    ).rejects.toThrow(
      'Failed to upload to Supabase Storage: Bucket not found or permission denied'
    );
  });
  it('createStorageProvider factory creates NoopStorageProvider when env is not configured', () => {
    const provider = createStorageProvider();
    expect(provider).toBeDefined();
  });
  describe('ScrapeExecutionService with Visual Diff Screenshots', () => {
    it('does not capture screenshot or upload when captureScreenshotOnChange is false', async () => {
      const repository = new InMemoryJobRepository();
      const scraper = new MockScraperEngine();
      const notifier = new MockNotificationProvider();
      const scheduler = new MockJobScheduler();
      const mockStorage = {
        isEnabled: true,
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
      };
      const job = await repository.createJob({
        url: 'https://example.com/product',
        userPrompt: 'extract price',
        notificationEmail: 'user@example.com',
        cronExpression: '0 */6 * * *',
        captureScreenshotOnChange: false,
      });
      await repository.updateJob(job.id, {
        status: 'ACTIVE',
        extractionPlan: fixturePlan({
          mode: 'single',
          readySelector: '.card',
          scope: 'page',
          identityFields: [],
          triggerRules: [],
          triggerMatchMode: 'all',
          fields: {
            price: {
              sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
              type: 'string',
              required: true,
            },
          },
        }),
      });
      scraper.setHandler(async (url, opts) => {
        expect(opts?.captureScreenshot).toBe(false);
        return {
          rawHtml: '<div class="card"><span class="price">$100</span></div>',
          httpStatus: 200,
          url,
          durationMs: 20,
          screenshot: Buffer.from('screenshot-bytes'),
        };
      });
      const service = new ScrapeExecutionService({
        jobRepository: repository,
        planExecutor: fixtureExecutor(scraper),
        alertRouter: notifier,
        jobScheduler: scheduler,
        storageProvider: mockStorage,
      });
      const run = await service.executeScrape(job.id);
      expect(run).toBeDefined();
      expect(mockStorage.upload).not.toHaveBeenCalled();
      expect(run?.screenshotUrl).toBeNull();
    });
    it('captures screenshot and uploads to Supabase when captureScreenshotOnChange is true and hasChanges is YES', async () => {
      const repository = new InMemoryJobRepository();
      const scraper = new MockScraperEngine();
      const notifier = new MockNotificationProvider();
      const scheduler = new MockJobScheduler();
      const mockStorage = {
        isEnabled: true,
        upload: vi.fn().mockResolvedValue({
          key: 'jobs/job-1/img.jpg',
          publicUrl:
            'https://xyz.supabase.co/storage/v1/object/public/specter-screenshots/jobs/job-1/img.jpg',
        }),
        getPublicUrl: vi
          .fn()
          .mockReturnValue(
            'https://xyz.supabase.co/storage/v1/object/public/specter-screenshots/jobs/job-1/img.jpg'
          ),
      };
      const job = await repository.createJob({
        url: 'https://example.com/product',
        userPrompt: 'extract price',
        notificationEmail: 'user@example.com',
        cronExpression: '0 */6 * * *',
        captureScreenshotOnChange: true,
      });
      await repository.updateJob(job.id, {
        status: 'ACTIVE',
        extractionPlan: fixturePlan({
          mode: 'single',
          readySelector: '.card',
          scope: 'page',
          identityFields: [],
          triggerRules: [],
          triggerMatchMode: 'all',
          fields: {
            price: {
              sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
              type: 'string',
              required: true,
            },
          },
        }),
      });
      // Previous run with price $100
      await repository.createRun({
        jobId: job.id,
        extractedData: { price: '$100' },
        normalizedHash: 'previous-hash-123',
        hasChanges: 'INITIAL',
        status: 'SUCCESS',
      });
      // Current run returns price $80 (hasChanges === YES)
      scraper.setHandler(async (url, opts) => {
        expect(opts?.captureScreenshot).toBe(true);
        return {
          rawHtml: '<div class="card"><span class="price">$80</span></div>',
          httpStatus: 200,
          url,
          durationMs: 20,
          screenshot: Buffer.from('screenshot-bytes-of-change'),
        };
      });
      const service = new ScrapeExecutionService({
        jobRepository: repository,
        planExecutor: fixtureExecutor(scraper),
        alertRouter: notifier,
        jobScheduler: scheduler,
        storageProvider: mockStorage,
      });
      const run = await service.executeScrape(job.id);
      expect(run).toBeDefined();
      expect(run?.hasChanges).toBe('YES');
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      expect(run?.screenshotUrl).toBe(
        'https://xyz.supabase.co/storage/v1/object/public/specter-screenshots/jobs/job-1/img.jpg'
      );
    });
    it('captures baseline screenshot on INITIAL run when captureScreenshotOnChange is true, and does NOT upload when data has NOT changed on subsequent run', async () => {
      const repository = new InMemoryJobRepository();
      const scraper = new MockScraperEngine();
      const notifier = new MockNotificationProvider();
      const scheduler = new MockJobScheduler();
      const mockStorage = {
        isEnabled: true,
        upload: vi.fn().mockResolvedValue({ publicUrl: 'https://cdn.example.com/baseline.jpg' }),
        getPublicUrl: vi.fn(),
      };
      const job = await repository.createJob({
        url: 'https://example.com/product',
        userPrompt: 'extract price',
        notificationEmail: 'user@example.com',
        cronExpression: '0 */6 * * *',
        captureScreenshotOnChange: true,
      });
      await repository.updateJob(job.id, {
        status: 'ACTIVE',
        extractionPlan: fixturePlan({
          mode: 'single',
          readySelector: '.card',
          scope: 'page',
          identityFields: [],
          triggerRules: [],
          triggerMatchMode: 'all',
          fields: {
            price: {
              sources: [{ kind: 'dom', selector: '.price', attribute: 'text' }],
              type: 'string',
              required: true,
            },
          },
        }),
      });
      // Run 1
      scraper.setHandler(async (url) => ({
        rawHtml: '<div class="card"><span class="price">$100</span></div>',
        httpStatus: 200,
        url,
        durationMs: 20,
        screenshot: Buffer.from('screenshot-bytes'),
      }));
      const service = new ScrapeExecutionService({
        jobRepository: repository,
        planExecutor: fixtureExecutor(scraper),
        alertRouter: notifier,
        jobScheduler: scheduler,
        storageProvider: mockStorage,
      });
      // Initial run (baseline screenshot captured)
      const initialRun = await service.executeScrape(job.id);
      expect(initialRun?.hasChanges).toBe('INITIAL');
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      expect(initialRun?.screenshotUrl).toBe('https://cdn.example.com/baseline.jpg');
      mockStorage.upload.mockClear();
      // Run 2: same content (hasChanges = NO, no upload)
      const secondRun = await service.executeScrape(job.id);
      expect(secondRun?.hasChanges).toBe('NO');
      expect(mockStorage.upload).not.toHaveBeenCalled();
      expect(secondRun?.screenshotUrl).toBeNull();
    });
  });
});
