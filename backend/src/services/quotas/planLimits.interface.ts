export interface PlanLimits {
  readonly maxActiveMonitors: number;
  readonly maxMonthlyCompilations: number;
  readonly maxMonthlyExecutions: number;
}

export interface IPlanLimitResolver {
  getLimitsForUser(userId: string): Promise<PlanLimits>;
}
