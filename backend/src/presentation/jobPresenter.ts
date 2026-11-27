import type { IJobRepository } from '../repositories/jobRepository.js';
import type { AccessCooldownService } from '../acquisition/cooldown.js';
import type { ScrapingJobEntity } from '../types/domain.js';
import type { ScrapingJobDto } from '@specter/contracts';
import { RunStatus } from '../types/enums.js';
import { JobMapper } from '../mappers/jobMapper.js';

export class JobPresenter {
  constructor(
    private readonly cooldown: AccessCooldownService,
    private readonly repository: IJobRepository
  ) {}

  async present(job: ScrapingJobEntity): Promise<ScrapingJobDto> {
    const [latest, accessState] = await Promise.all([
      this.repository.findRunsByJobId(job.id, 1),
      this.cooldown.state(job),
    ]);
    const currentRun = latest[0]?.status === RunStatus.Running ? latest[0] : null;
    return JobMapper.entityToDto(job, { accessState, currentRun });
  }

  async presentMany(jobs: ScrapingJobEntity[]): Promise<ScrapingJobDto[]> {
    if (jobs.length === 0) return [];
    if (jobs.length === 1) return [await this.present(jobs[0]!)];

    // Single indexed query to find all running runs across monitors instead of N separate queries
    const runningRuns = await this.repository.findRunningRuns();
    const runningByJobId = new Map(runningRuns.map((run) => [run.jobId, run]));

    return Promise.all(
      jobs.map(async (job) =>
        JobMapper.entityToDto(job, {
          accessState: await this.cooldown.state(job),
          currentRun: runningByJobId.get(job.id) ?? null,
        })
      )
    );
  }
}
