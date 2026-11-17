'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type DashboardStats,
  type DiffSummary,
  type JobRunDto,
  type JobRunsDto,
  type JobTimeseriesDto,
  type PaginatedResponse,
  type ScrapingJobDto,
  type SessionDto,
  type TimeseriesRange,
  type UserDto,
  type UserIntegrationsDto,
} from '@/lib/api';
import {
  PAGINATION_DEFAULT_PAGE_SIZE,
  PAGINATION_RUNS_PAGE_SIZE,
  PAGINATION_TIMESERIES_PAGE_SIZE,
} from '@specter/contracts';

export type CreateJobInput = Parameters<typeof api.createJob>[0];
export type UpdateJobInput = Parameters<typeof api.updateJob>[1];

export const dashboardKeys = {
  all: ['dashboard'] as const,
  user: ['auth', 'me'] as const,
  quotas: ['quotas'] as const,
  jobs: ['jobs'] as const,
  jobPage: (page: number, pageSize: number, status?: string, search?: string) =>
    ['jobs', page, pageSize, status, search] as const,
  job: (id: string) => ['jobs', id] as const,
  jobRuns: (id: string, page = 1, pageSize: number = PAGINATION_RUNS_PAGE_SIZE) =>
    ['jobRuns', id, page, pageSize] as const,
  timeseries: (id: string, range: string) => ['timeseries', id, range] as const,
  stats: ['stats'] as const,
  integrations: ['integrations'] as const,
  sessions: ['sessions'] as const,
};

// ==========================================
// QUERIES
// ==========================================

export function useCurrentUserQuery() {
  return useQuery<UserDto | null>({
    queryKey: dashboardKeys.user,
    queryFn: async () => {
      try {
        return await api.getMe();
      } catch {
        return null;
      }
    },
    staleTime: 60 * 1000,
  });
}

export function useJobsQuery(
  page = 1,
  pageSize: number = PAGINATION_DEFAULT_PAGE_SIZE,
  status?: import('@specter/contracts').JobStatus | 'recovering' | 'paused',
  search = ''
) {
  return useQuery<PaginatedResponse<ScrapingJobDto>>({
    queryKey: dashboardKeys.jobPage(page, pageSize, status, search),
    queryFn: () => api.listJobs({ page, pageSize, status, search }),
    staleTime: 10 * 1000,
  });
}

export function useStatsQuery() {
  return useQuery<DashboardStats>({
    queryKey: dashboardKeys.stats,
    queryFn: () => api.getStats(),
    staleTime: 10 * 1000,
  });
}

export function useJobRunsQuery(
  jobId: string | null | undefined,
  page = 1,
  pageSize: number = PAGINATION_RUNS_PAGE_SIZE
) {
  return useQuery<JobRunsDto>({
    queryKey: jobId ? dashboardKeys.jobRuns(jobId, page, pageSize) : ['jobRuns', 'none'],
    queryFn: async () => {
      if (!jobId) {
        return {
          runs: [],
          latestDiff: null,
          pagination: {
            page: 1,
            pageSize,
            totalItems: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
          summary: {
            totalRuns: 0,
            changedRuns: 0,
            lastChange: null,
            averageDurationMs: null,
          },
        };
      }
      return api.getJobRuns(jobId, page, pageSize);
    },
    enabled: Boolean(jobId),
    staleTime: 5 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useJobTimeseriesQuery(
  jobId: string | null | undefined,
  range: TimeseriesRange = 'all',
  page = 1,
  pageSize: number = PAGINATION_TIMESERIES_PAGE_SIZE
) {
  return useQuery<JobTimeseriesDto>({
    queryKey: jobId
      ? [...dashboardKeys.timeseries(jobId, range), page, pageSize]
      : ['timeseries', 'none'],
    queryFn: async () => {
      if (!jobId) {
        return {
          jobId: '',
          range,
          points: [],
          previousPoint: null,
          pagination: {
            page: 1,
            pageSize,
            totalItems: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
      }
      return api.getJobTimeseries(jobId, range, page, pageSize);
    },
    enabled: Boolean(jobId),
    staleTime: 15 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useUserQuotasQuery(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.quotas,
    queryFn: () => api.getUserQuotas(),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useIntegrationsQuery(enabled = true) {
  return useQuery<UserIntegrationsDto>({
    queryKey: dashboardKeys.integrations,
    queryFn: () => api.getIntegrations(),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useSessionsQuery(
  enabled = true,
  page = 1,
  pageSize: number = PAGINATION_DEFAULT_PAGE_SIZE
) {
  return useQuery<PaginatedResponse<SessionDto>>({
    queryKey: [...dashboardKeys.sessions, page, pageSize],
    queryFn: () => api.getSessions(page, pageSize),
    enabled,
    staleTime: 30 * 1000,
  });
}

// ==========================================
// INVALIDATION HELPER
// ==========================================

export function useInvalidateDashboard() {
  const queryClient = useQueryClient();

  const invalidateJobsAndStats = useCallback(
    async (jobId?: string) => {
      const promises: Promise<unknown>[] = [
        queryClient.invalidateQueries({ queryKey: dashboardKeys.quotas }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.stats }),
      ];
      if (jobId) {
        promises.push(queryClient.invalidateQueries({ queryKey: ['jobRuns', jobId] }));
        promises.push(queryClient.invalidateQueries({ queryKey: ['timeseries', jobId] }));
      } else {
        promises.push(queryClient.invalidateQueries({ queryKey: ['jobRuns'] }));
        promises.push(queryClient.invalidateQueries({ queryKey: ['timeseries'] }));
      }
      await Promise.all(promises);
    },
    [queryClient]
  );

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dashboardKeys.user }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.stats }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.integrations }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.sessions }),
    ]);
  };

  return {
    queryClient,
    invalidateJobsAndStats,
    invalidateAll,
  };
}

// ==========================================
// MUTATIONS: AUTH & PROFILE
// ==========================================

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) => api.login(credentials),
    onSuccess: (user) => {
      queryClient.setQueryData(dashboardKeys.user, user);
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });
    },
  });
}

export function useRegisterMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: {
      email: string;
      password: string;
      name?: string;
      timezone?: string;
    }) => api.register(credentials),
    onSuccess: (user) => {
      queryClient.setQueryData(dashboardKeys.user, user);
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.setQueryData(dashboardKeys.user, null);
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.integrations });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.sessions });
    },
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string | null; timezone?: string }) => api.updateProfile(data),
    onSuccess: (updated) => {
      queryClient.setQueryData(dashboardKeys.user, updated);
    },
  });
}

// ==========================================
// MUTATIONS: JOBS & WORKERS
// ==========================================

export function useCreateJobMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateJobInput) => api.createJob(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.quotas });
    },
  });
}

export function useUpdateJobMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateJobInput }) =>
      api.updateJob(id, payload),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobRuns(variables.id) });
    },
  });
}

export function useDeleteJobMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => api.deleteJob(jobId),
    onSuccess: (_, jobId) => {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.quotas });
      queryClient.removeQueries({ queryKey: dashboardKeys.jobRuns(jobId) });
    },
  });
}

export function useTogglePauseMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, paused }: { jobId: string; paused: boolean }) =>
      api.togglePause(jobId, paused),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.quotas });
    },
  });
}

export function useTriggerJobMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => api.triggerNow(jobId),
    onSuccess: (_, jobId) => {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobRuns(jobId) });
    },
  });
}

export function useRecompileJobMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => api.triggerRecompile(jobId),
    onSuccess: (_, jobId) => {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobRuns(jobId) });
    },
  });
}

export function useCancelCompilationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => api.cancelCompilation(jobId),
    onSuccess: (_, jobId) => {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.jobRuns(jobId) });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.quotas });
    },
  });
}

export function useProbeUrlMutation() {
  return useMutation({
    mutationFn: (url: string) => api.probeUrl(url),
  });
}

export function useCheckSessionMutation() {
  return useMutation({
    mutationFn: (url: string) => api.checkSession(url),
  });
}

// ==========================================
// MUTATIONS: INTEGRATIONS & SESSIONS
// ==========================================

export function useUpdateIntegrationsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      telegramEnabled: boolean;
      telegramChatId?: string | null;
      webhookEnabled: boolean;
      webhookUrl?: string | null;
      webhookSecret?: string | null;
    }) => api.updateIntegrations(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(dashboardKeys.integrations, updated);
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.integrations });
    },
  });
}

export function useDeleteSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => api.deleteSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.sessions });
    },
  });
}

export function useTestTelegramMutation() {
  return useMutation({
    mutationFn: (params: { chatId: string }) => api.testTelegram(params),
  });
}

export function useTestWebhookMutation() {
  return useMutation({
    mutationFn: (params: { webhookUrl: string; secret?: string | null }) => api.testWebhook(params),
  });
}
