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
    if (!job) throw new Error(`Job not found: ${jobId}`);
    return this.timezoneForUser(job.userId);
  }

  private async timezoneForUser(userId: string): Promise<string> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error(`User not found: ${userId}`);
    return user.timezone;
  }

  async activeSchedules(): Promise<ReconcilableJob[]> {
    const jobs = await this.jobs.findActiveJobs();
    const timezones = new Map<string, string>();
    const schedules: ReconcilableJob[] = [];
    for (const job of jobs) {
      let timezone = timezones.get(job.userId);
      if (!timezone) {
        timezone = await this.timezoneForUser(job.userId);
        timezones.set(job.userId, timezone);
      }
      schedules.push({ id: job.id, cronExpression: job.cronExpression, timezone });
    }
    return schedules;
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
