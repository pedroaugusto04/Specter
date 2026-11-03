import { logger } from './logger.js';
import type { ChangeStatus } from '../types/domain.js';
import type { IStorageProvider } from '../providers/storage/storage.interface.js';

/**
 * Decodes a base64 encoded screenshot into a Buffer.
 * Supports raw base64 or data URI scheme (e.g. data:image/jpeg;base64,...).
 */
export function decodeBase64Screenshot(input?: string | null): Buffer | undefined {
  if (!input || typeof input !== 'string') {
    return undefined;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }
  const base64Data = trimmed.includes(';base64,')
    ? trimmed.split(';base64,').pop()!
    : trimmed;

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    return buffer.length > 0 ? buffer : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetches a screenshot from a temporary remote URL provided by unblockers (e.g. ScraperAPI, Crawlbase).
 */
export async function fetchRemoteScreenshot(
  imageUrl?: string | null,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<Buffer | undefined> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return undefined;
  }

  try {
    const res = await fetchFn(imageUrl.trim(), { signal });
    if (!res.ok) {
      return undefined;
    }
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    return buffer.length > 0 ? buffer : undefined;
  } catch {
    return undefined;
  }
}

export interface UploadScreenshotParams {
  jobId: string;
  captureScreenshotOnChange: boolean;
  hasChanges: ChangeStatus;
  screenshot?: Buffer;
  storageProvider: IStorageProvider;
  logContext?: string;
}

/**
 * Uploads a screenshot to storage if the job is configured for screenshot capture,
 * changes occurred (or initial baseline run), a valid screenshot Buffer exists,
 * and the storage provider is enabled.
 */
export async function uploadScreenshotIfEligible(
  params: UploadScreenshotParams
): Promise<string | null> {
  const {
    jobId,
    captureScreenshotOnChange,
    hasChanges,
    screenshot,
    storageProvider,
    logContext = 'scrape execution',
  } = params;

  if (
    !captureScreenshotOnChange ||
    (hasChanges !== 'INITIAL' && hasChanges !== 'YES') ||
    !screenshot ||
    !storageProvider.isEnabled
  ) {
    return null;
  }

  try {
    const runTimestamp = Date.now();
    const storageKey = `jobs/${jobId}/${runTimestamp}.jpg`;
    const uploadRes = await storageProvider.upload(storageKey, screenshot, 'image/jpeg');
    return uploadRes.publicUrl;
  } catch (uploadErr) {
    logger.error(`Failed to upload screenshot to Storage during ${logContext}`, {
      jobId,
      error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
    });
    return null;
  }
}
