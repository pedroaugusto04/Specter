import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { IUserRepository } from '../repositories/userRepository.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import type { PlaywrightStorageState } from '../types/session.js';
import { resolveSessionStorageState } from '../utils/sessionHelper.js';

export interface JobExecutionContext {
  pageLanguage: string | undefined;
  timezone: string | undefined;
  storageState: PlaywrightStorageState | undefined;
}

export async function resolveJobExecutionContext(
  userRepository: Pick<IUserRepository, 'findById'>,
  sessionRepository: ISessionRepository,
  job: Pick<ScrapingJobEntity, 'id' | 'userId' | 'url'>,
  logAction: string
): Promise<JobExecutionContext> {
  const [owner, storageState] = await Promise.all([
    userRepository.findById(job.userId),
    resolveSessionStorageState(sessionRepository, job.userId, job.url, {
      jobId: job.id,
      logAction,
    }),
  ]);

  return {
    pageLanguage: owner?.pageLanguage ?? owner?.browserPageLanguage ?? undefined,
    timezone: owner?.timezone,
    storageState,
  };
}
