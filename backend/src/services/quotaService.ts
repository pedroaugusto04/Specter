import type { UserQuotaSummary } from '@specter/contracts';
import { QuotaExceededError } from '../errors/domainErrors.js';
import type { IJobRepository } from '../repositories/jobRepository.js';
import type { IUsageRepository } from '../repositories/usageRepository.js';
import type { IPlanLimitResolver, PlanLimits } from './quotas/planLimits.interface.js';

export interface QuotaServiceDeps {
  jobRepository: IJobRepository;
  usageRepository: IUsageRepository;
  planLimitResolver: IPlanLimitResolver;
}

export class QuotaService {
  constructor(private readonly deps: QuotaServiceDeps) {}

  private async getLimits(userId: string): Promise<PlanLimits> {
    return this.deps.planLimitResolver.getLimitsForUser(userId);
  }

  async assertCanActivateMonitor(userId: string): Promise<void> {
    const limits = await this.getLimits(userId);
    const activeCount = await this.deps.jobRepository.countActiveJobsByUserId(userId);

    if (activeCount >= limits.maxActiveMonitors) {
      throw new QuotaExceededError(
        `Active monitor limit reached (${activeCount}/${limits.maxActiveMonitors}). Pause or delete existing monitors to activate more.`,
        {
          quotaType: 'ACTIVE_MONITORS',
          current: activeCount,
          limit: limits.maxActiveMonitors,
        }
      );
    }
  }

  async assertCanCompile(userId: string): Promise<void> {
    const limits = await this.getLimits(userId);
    const usage = await this.deps.usageRepository.getUsage(userId);

    if (usage.compilationsCount >= limits.maxMonthlyCompilations) {
      throw new QuotaExceededError(
        `Monthly compilation limit reached (${usage.compilationsCount}/${limits.maxMonthlyCompilations}). Compilations reset at the start of next month.`,
        {
          quotaType: 'COMPILATIONS',
          current: usage.compilationsCount,
          limit: limits.maxMonthlyCompilations,
        }
      );
    }
  }

  async assertCanExecuteScrape(userId: string): Promise<void> {
    const limits = await this.getLimits(userId);
    const usage = await this.deps.usageRepository.getUsage(userId);

    if (usage.executionsCount >= limits.maxMonthlyExecutions) {
      throw new QuotaExceededError(
        `Monthly scrape execution limit reached (${usage.executionsCount}/${limits.maxMonthlyExecutions}). Runs will resume next month.`,
        {
          quotaType: 'EXECUTIONS',
          current: usage.executionsCount,
          limit: limits.maxMonthlyExecutions,
        }
      );
    }
  }

  async getQuotaSummary(userId: string): Promise<UserQuotaSummary> {
    const [limits, activeCount, usage] = await Promise.all([
      this.getLimits(userId),
      this.deps.jobRepository.countActiveJobsByUserId(userId),
      this.deps.usageRepository.getUsage(userId),
    ]);

    return {
      activeMonitors: {
        used: activeCount,
        limit: limits.maxActiveMonitors,
        remaining: Math.max(0, limits.maxActiveMonitors - activeCount),
      },
      monthlyCompilations: {
        used: usage.compilationsCount,
        limit: limits.maxMonthlyCompilations,
        remaining: Math.max(0, limits.maxMonthlyCompilations - usage.compilationsCount),
      },
      monthlyExecutions: {
        used: usage.executionsCount,
        limit: limits.maxMonthlyExecutions,
        remaining: Math.max(0, limits.maxMonthlyExecutions - usage.executionsCount),
      },
    };
  }
}
