import { JobNotFoundError, UserNotFoundError } from '../errors/domainErrors.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { IUserRepository } from '../repositories/userRepository.js';
import { JobStatus } from '../types/enums.js';
import type { IJobScheduler } from './scheduler.interface.js';
import type { ReconcilableJob } from './reconciler.js';

export class ScheduleCoordinator {
  constructor(
    private readonly jobs: IJobRepository,
    private readonly users: IUserRepository
  ) {}

  async timezoneForJob(jobId: string): Promise<string> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new JobNotFoundError(jobId);
    return this.timezoneForUser(job.userId);
  }

  private async timezoneForUser(userId: string): Promise<string> {
    const user = await this.users.findById(userId);
    if (!user) throw new UserNotFoundError(userId);
    return user.timezone;
  }

  async activeSchedules(): Promise<ReconcilableJob[]> {
    const jobs = await this.jobs.findActiveJobs();
    const uniqueUserIds = [...new Set(jobs.map((job) => job.userId))];
    const timezoneEntries = await Promise.all(
      uniqueUserIds.map(async (userId) => [userId, await this.timezoneForUser(userId)] as const)
    );
    const timezones = new Map(timezoneEntries);
    return jobs.map((job) => ({
      id: job.id,
      cronExpression: job.cronExpression,
      timezone: timezones.get(job.userId)!,
    }));
  }

  async refreshUserSchedules(userId: string, scheduler: IJobScheduler): Promise<void> {
    const jobs = await this.jobs.findAll(JobStatus.Active, userId);
    for (const job of jobs) {
      await scheduler.removeRepeatableJob(job.id, job.bullmqRepeatableKey);
      const key = await scheduler.scheduleRepeatableJob(job.id, job.cronExpression);
      await this.jobs.updateJob(job.id, { bullmqRepeatableKey: key });
    }
  }
}
