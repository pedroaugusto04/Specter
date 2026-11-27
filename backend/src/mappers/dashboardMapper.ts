import type { DashboardStatsDto } from '@specter/contracts';

export const DashboardMapper = {
  emptyDto(): DashboardStatsDto {
    return {
      totalJobs: 0,
      activeJobs: 0,
      recoveringOrCompilingJobs: 0,
      failedOrPausedJobs: 0,
      totalRuns: 0,
      DetectedChangesCount: 0,
    };
  },
};
