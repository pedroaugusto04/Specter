import { env } from '../config/env.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import { logger } from '../utils/logger.js';

export class RetentionService {
  private readonly jobRepository: IJobRepository;
  private readonly retentionDays: number;

  constructor(jobRepository: IJobRepository, retentionDays: number = env.RETENTION_DAYS_UNCHANGED) {
    this.jobRepository = jobRepository;
    this.retentionDays = retentionDays;
  }

  /**
   * Expunges unchanged snapshots (`hasChanges = 'NO'`) older than `retentionDays`.
   * Preserves all snapshots with `hasChanges = 'YES'` or `'INITIAL'`.
   */
  async pruneUnchangedSnapshots(
    now: Date = new Date()
  ): Promise<{ deletedCount: number; cutoffDate: Date }> {
    const cutoffMs = now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffMs);

    await this.jobRepository.purgeEvidence(
      new Date(now.getTime() - env.EXTRACTION_EVIDENCE_RETENTION_DAYS * 86400000)
    );
    const deletedCount = await this.jobRepository.deleteUnchangedRunsOlderThan(cutoffDate);

    logger.info('Storage retention pruning completed', {
      deletedCount,
      retentionDays: this.retentionDays,
      cutoffDate: cutoffDate.toISOString(),
    });

    return {
      deletedCount,
      cutoffDate,
    };
  }
}
