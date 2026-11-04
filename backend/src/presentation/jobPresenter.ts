import type { AccessCooldownService } from '../acquisition/cooldown.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import type { ScrapingJobDto } from '@specter/contracts';
import { JobMapper } from '../mappers/jobMapper.js';

export class JobPresenter {
  constructor(private readonly cooldown?: AccessCooldownService) {}
  async present(job: ScrapingJobEntity): Promise<ScrapingJobDto> {
    return JobMapper.entityToDto(job, {
      accessState: (await this.cooldown?.state(job)) ?? null,
    });
  }
}
