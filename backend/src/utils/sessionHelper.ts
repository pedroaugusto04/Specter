import type { PlaywrightStorageState } from '../db/schema.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import { logger } from './logger.js';
import { extractDomainCandidates } from './urlNormalizer.js';

export interface ResolveSessionStorageOptions {
  jobId?: string;
  logAction?: string;
}

/**
 * Reusable helper to safely resolve Playwright storageState from user's saved web sessions.
 * Centralizes the session lookup previously duplicated across jobService, compilationService, and scrapeExecutionService.
 */
export async function resolveSessionStorageState(
  sessionRepository?: ISessionRepository,
  userId?: string,
  targetUrl?: string,
  options?: ResolveSessionStorageOptions
): Promise<PlaywrightStorageState | undefined> {
  if (!sessionRepository || !userId || !targetUrl) {
    return undefined;
  }

  try {
    const candidates = extractDomainCandidates(targetUrl);
    const domain = candidates[0];
    if (!domain) return undefined;

    const savedSession = await sessionRepository.findByUserAndDomain(userId, domain);
    if (savedSession?.storageState) {
      if (options?.logAction) {
        logger.info(options.logAction, {
          jobId: options.jobId,
          domain: savedSession.domain,
          cookieCount: savedSession.cookieCount,
        });
      }
      return savedSession.storageState;
    }
  } catch {
    // Gracefully ignore parsing or lookup failures for session injection
  }

  return undefined;
}
