import type { DashboardStatsDto } from '@specter/contracts';
export const DashboardMapper = {
  toDto(stats: DashboardStatsDto): DashboardStatsDto {
    return {
      totalJobs: stats.totalJobs,
      activeJobs: stats.activeJobs,
      healingOrCompilingJobs: stats.healingOrCompilingJobs,
      failedOrPausedJobs: stats.failedOrPausedJobs,
      totalRuns: stats.totalRuns,
      DetectedChangesCount: stats.DetectedChangesCount,
    };
  },
};
