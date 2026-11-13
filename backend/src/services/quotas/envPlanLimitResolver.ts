import { env } from '../../config/env.js';
import type { IPlanLimitResolver, PlanLimits } from './planLimits.interface.js';

export class EnvPlanLimitResolver implements IPlanLimitResolver {
  constructor(private readonly defaultLimits?: Partial<PlanLimits>) {}

  async getLimitsForUser(_userId: string): Promise<PlanLimits> {
    return {
      maxActiveMonitors: this.defaultLimits?.maxActiveMonitors ?? env.DEFAULT_MAX_ACTIVE_MONITORS,
      maxMonthlyCompilations:
        this.defaultLimits?.maxMonthlyCompilations ?? env.DEFAULT_MAX_MONTHLY_COMPILATIONS,
      maxMonthlyExecutions:
        this.defaultLimits?.maxMonthlyExecutions ?? env.DEFAULT_MAX_MONTHLY_EXECUTIONS,
    };
  }
}
