import type { IJobRepository } from '../repositories/jobRepository.js';
import type { AccessCooldownService } from '../acquisition/cooldown.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import type { ScrapingJobDto } from '@specter/contracts';
import { JobMapper } from '../mappers/jobMapper.js';

export class JobPresenter {
  constructor(
    private readonly cooldown?: AccessCooldownService,
    private readonly repository?: IJobRepository
  ) {}
  async present(job: ScrapingJobEntity): Promise<ScrapingJobDto> {
    const latest = (await this.repository?.findRunsByJobId(job.id, 1))?.[0];
    return {
      ...JobMapper.entityToDto(job, {
        accessState: (await this.cooldown?.state(job)) ?? null,
      }),
      currentRun: latest?.status === 'RUNNING' ? JobMapper.runEntityToDto(latest) : null,
    };
  }
}
