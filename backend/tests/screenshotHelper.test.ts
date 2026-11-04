import { describe, it, expect, vi } from 'vitest';
import {
  decodeBase64Screenshot,
  fetchRemoteScreenshot,
  uploadScreenshotIfEligible,
} from '../src/utils/screenshotHelper.js';
import type {
  IStorageProvider,
  StorageUploadResult,
} from '../src/providers/storage/storage.interface.js';

describe('screenshotHelper utils', () => {
  describe('decodeBase64Screenshot', () => {
    it('returns undefined for empty, null, or invalid inputs', () => {
      expect(decodeBase64Screenshot(null)).toBeUndefined();
      expect(decodeBase64Screenshot(undefined)).toBeUndefined();
      expect(decodeBase64Screenshot('')).toBeUndefined();
      expect(decodeBase64Screenshot('   ')).toBeUndefined();
    });

    it('decodes raw base64 string to buffer', () => {
      const rawText = 'Hello Screenshot';
      const base64 = Buffer.from(rawText).toString('base64');
      const result = decodeBase64Screenshot(base64);

      expect(result).toBeDefined();
      expect(result!.toString('utf-8')).toBe(rawText);
    });

    it('decodes data URI formatted base64 string', () => {
      const rawText = 'Image Binary Content';
      const base64 = Buffer.from(rawText).toString('base64');
      const dataUri = `data:image/jpeg;base64,${base64}`;

      const result = decodeBase64Screenshot(dataUri);
      expect(result).toBeDefined();
      expect(result!.toString('utf-8')).toBe(rawText);
    });
  });

  describe('fetchRemoteScreenshot', () => {
    it('returns undefined if imageUrl is null or empty', async () => {
      expect(await fetchRemoteScreenshot(null)).toBeUndefined();
      expect(await fetchRemoteScreenshot('')).toBeUndefined();
      expect(await fetchRemoteScreenshot('   ')).toBeUndefined();
    });

    it('fetches remote screenshot and returns Buffer on success', async () => {
      const dummyBuffer = Buffer.from('mock-image-bytes');
      const unsharedArrayBuffer = dummyBuffer.buffer.slice(
        dummyBuffer.byteOffset,
        dummyBuffer.byteOffset + dummyBuffer.byteLength
      );
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => unsharedArrayBuffer,
      });

      const result = await fetchRemoteScreenshot(
        'https://api.scraper.com/img.jpg',
        mockFetch as unknown as typeof fetch
      );

      expect(mockFetch).toHaveBeenCalledWith('https://api.scraper.com/img.jpg', {
        signal: undefined,
      });
      expect(result).toBeDefined();
      expect(result!.toString('utf-8')).toBe('mock-image-bytes');
    });

    it('returns undefined when remote server returns error status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await fetchRemoteScreenshot(
        'https://api.scraper.com/missing.jpg',
        mockFetch as unknown as typeof fetch
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined when fetch throws a network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));

      const result = await fetchRemoteScreenshot(
        'https://api.scraper.com/error.jpg',
        mockFetch as unknown as typeof fetch
      );

      expect(result).toBeUndefined();
    });
  });

  describe('uploadScreenshotIfEligible', () => {
    const dummyScreenshot = Buffer.from('screenshot-image');

    const createMockStorageProvider = (isEnabled = true, shouldFail = false): IStorageProvider => ({
      isEnabled,
      upload: vi.fn(async (key: string): Promise<StorageUploadResult> => {
        if (shouldFail) {
          throw new Error('Supabase S3 bucket connection error');
        }
        return {
          key,
          publicUrl: `https://storage.supabase.co/bucket/${key}`,
        };
      }),
      getPublicUrl: (key: string) => `https://storage.supabase.co/bucket/${key}`,
    });

    it('returns null if captureScreenshotOnChange is false', async () => {
      const storage = createMockStorageProvider(true);
      const url = await uploadScreenshotIfEligible({
        jobId: 'job-1',
        captureScreenshotOnChange: false,
        hasChanges: 'YES',
        screenshot: dummyScreenshot,
        storageProvider: storage,
      });

      expect(url).toBeNull();
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('returns null if hasChanges is NO', async () => {
      const storage = createMockStorageProvider(true);
      const url = await uploadScreenshotIfEligible({
        jobId: 'job-1',
        captureScreenshotOnChange: true,
        hasChanges: 'NO',
        screenshot: dummyScreenshot,
        storageProvider: storage,
      });

      expect(url).toBeNull();
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('returns null if screenshot is undefined', async () => {
      const storage = createMockStorageProvider(true);
      const url = await uploadScreenshotIfEligible({
        jobId: 'job-1',
        captureScreenshotOnChange: true,
        hasChanges: 'YES',
        screenshot: undefined,
        storageProvider: storage,
      });

      expect(url).toBeNull();
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('returns null if storageProvider is disabled', async () => {
      const storage = createMockStorageProvider(false);
      const url = await uploadScreenshotIfEligible({
        jobId: 'job-1',
        captureScreenshotOnChange: true,
        hasChanges: 'YES',
        screenshot: dummyScreenshot,
        storageProvider: storage,
      });

      expect(url).toBeNull();
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('uploads and returns publicUrl on INITIAL run', async () => {
      const storage = createMockStorageProvider(true);
      const url = await uploadScreenshotIfEligible({
        jobId: 'job-123',
        captureScreenshotOnChange: true,
        hasChanges: 'INITIAL',
        screenshot: dummyScreenshot,
        storageProvider: storage,
      });

      expect(url).toContain('https://storage.supabase.co/bucket/jobs/job-123/');
      expect(url).toMatch(/\.jpg$/);
      expect(storage.upload).toHaveBeenCalledTimes(1);
    });

    it('uploads and returns publicUrl on YES change status', async () => {
      const storage = createMockStorageProvider(true);
      const url = await uploadScreenshotIfEligible({
        jobId: 'job-456',
        captureScreenshotOnChange: true,
        hasChanges: 'YES',
        screenshot: dummyScreenshot,
        storageProvider: storage,
      });

      expect(url).toContain('https://storage.supabase.co/bucket/jobs/job-456/');
      expect(url).toMatch(/\.jpg$/);
      expect(storage.upload).toHaveBeenCalledTimes(1);
    });

    it('catches upload errors gracefully and returns null without throwing', async () => {
      const storage = createMockStorageProvider(true, true);
      const url = await uploadScreenshotIfEligible({
        jobId: 'job-fail',
        captureScreenshotOnChange: true,
        hasChanges: 'YES',
        screenshot: dummyScreenshot,
        storageProvider: storage,
        logContext: 'test execution',
      });

      expect(url).toBeNull();
    });
  });
});
