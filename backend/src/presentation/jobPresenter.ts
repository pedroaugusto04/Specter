import type { AccessCooldownService } from '../acquisition/cooldown.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import type { ScrapingJobDto } from '@specter/contracts';
import { JobMapper } from '../mappers/jobMapper.js';
import { env } from '../config/env.js';

export class JobPresenter {
  constructor(
    private readonly cooldown?: AccessCooldownService,
    private readonly semanticDefaults = {
      enabled: env.SEMANTIC_REVIEW_ENABLED,
      threshold: env.SEMANTIC_REVIEW_THRESHOLD,
    }
  ) {}
  async present(job: ScrapingJobEntity): Promise<ScrapingJobDto> {
    return JobMapper.entityToDto(job, {
      semanticDefaults: this.semanticDefaults,
      accessState: (await this.cooldown?.state(job)) ?? null,
    });
  }
}
