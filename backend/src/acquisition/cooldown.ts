import { AccessFailure } from '../types/access.js';
import cronParser from 'cron-parser';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import { logger } from '../utils/logger.js';

import type { AccessState } from '../types/access.js';
export type { AccessState } from '../types/access.js';

export interface IAccessCooldownStore {
  get(key: string): Promise<number | null>;
  blocked(
    key: string,
    threshold: number,
    durationMs: number,
    now: number,
    retentionMs: number
  ): Promise<number | null>;
  clear(key: string): Promise<void>;
}

export class AccessCooldownService {
  constructor(
    private readonly store: IAccessCooldownStore,
    private readonly sessions: ISessionRepository,
    private readonly threshold = env.ACCESS_BLOCK_THRESHOLD,
    private readonly durationMs = env.ACCESS_BLOCK_COOLDOWN_MINUTES * 60000
  ) {}

  private async key(job: ScrapingJobEntity): Promise<string> {
    const session = await this.sessions.findByUserAndDomain(job.userId, job.url);
    const revision = createHash('sha256')
      .update(JSON.stringify([job.url, job.planRevision, session?.updatedAt.toISOString()]))
      .digest('hex');
    return `specter:access:${job.id}:${revision}`;
  }

  async forMonitor(job: ScrapingJobEntity) {
    // Capture the access revision once, so a session update during acquisition cannot
    // apply an old failure to the new session's cooldown.
    const key = await this.key(job);
    return {
      state: async (): Promise<AccessState | null> => {
        const until = await this.store.get(key);
        return until && until > Date.now()
          ? { reason: AccessFailure.Blocked, retryAt: new Date(until).toISOString() }
          : null;
      },
      record: async (blocked: boolean): Promise<void> => {
        if (!blocked) {
          await this.store.clear(key);
          return;
        }
        const schedule = cronParser.parseExpression(job.cronExpression);
        schedule.next();
        const retentionMs = Math.max(
          this.durationMs,
          schedule.next().getTime() - Date.now() + this.durationMs
        );
        const until = await this.store.blocked(
          key,
          this.threshold,
          this.durationMs,
          Date.now(),
          retentionMs
        );
        if (until) {
          logger.info('Access cooldown opened', {
            jobId: job.id,
            retryAt: new Date(until).toISOString(),
          });
        }
      },
    };
  }

  async state(job: ScrapingJobEntity): Promise<AccessState | null> {
    return (await this.forMonitor(job)).state();
  }

  async record(job: ScrapingJobEntity, blocked: boolean): Promise<void> {
    return (await this.forMonitor(job)).record(blocked);
  }
}
