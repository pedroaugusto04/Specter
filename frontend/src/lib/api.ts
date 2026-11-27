import type {
  CreateJobRequest,
  DashboardStatsDto as DashboardStats,
  JobPlanVersionsDto,
  JobRunsDto,
  JobStatusFilter,
  JobTimeseriesDto,
  NotificationTestDto,
  PaginatedResponse,
  ProbeUrlDto,
  ScrapingJobDto,
  SessionCheckDto,
  SessionDto,
  TimeseriesRange,
  TriggerJobDto,
  UpdateIntegrationsRequest,
  UpdateJobRequest,
  UserDto,
  UserIntegrationsDto,
  UserQuotaSummary,
} from '@specter/contracts';
import {
  PAGINATION_DEFAULT_PAGE_SIZE,
  PAGINATION_RUNS_PAGE_SIZE,
  PAGINATION_TIMESERIES_PAGE_SIZE,
  getUserFailure,
  parseStructuredUserFailure,
} from '@specter/contracts';

export type {
  DashboardStatsDto as DashboardStats,
  JobPlanVersionDto,
  JobPlanVersionsDto,
  JobRunDto,
  JobRunsDto,
  JobStatusFilter,
  JobTimeseriesDto,
  JobTimeseriesPointDto,
  PaginatedResponse,
  ScrapingJobDto,
  SessionDto,
  TimeseriesRange,
  UserDto,
  UserIntegrationsDto,
  UserQuotaSummary,
} from '@specter/contracts';

export interface ApiValidationErrorDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: ApiValidationErrorDetail[];
  public readonly fieldErrors: Record<string, string>;
  public readonly retryAfterSeconds?: number;
  public readonly upstreamStatus?: number;

  constructor(
    message: string,
    status: number,
    data?: {
      error?: string;
      details?: ApiValidationErrorDetail[];
      fields?: Record<string, string>;
      retryAfterSeconds?: number;
      status?: number;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = data?.error;
    this.details = data?.details;
    this.fieldErrors = { ...(data?.fields ?? {}) };
    this.retryAfterSeconds = data?.retryAfterSeconds;
    this.upstreamStatus = data?.status;
  }
}

/**
 * Splits an API error into recognized form field errors and a user-visible global message.
 * Ensures unmapped fields (e.g. `root`, `webhookUrl`, `triggerRules`) are never silently swallowed.
 */
export function extractFormError<TField extends string>(
  error: unknown,
  allowedFields: readonly TField[],
  fallbackMessage: string
): {
  fieldErrors: Partial<Record<TField, string>>;
  globalError: string | null;
} {
  if (error instanceof ApiError) {
    const allowed = new Set<string>(allowedFields);
    const mapped: Partial<Record<TField, string>> = {};
    const unmappedMessages: string[] = [];

    for (const [field, message] of Object.entries(error.fieldErrors)) {
      if (allowed.has(field)) {
        mapped[field as TField] = message;
      } else if (message) {
        unmappedMessages.push(message);
      }
    }

    const parsedStructured = parseStructuredUserFailure(error.message);
    const readableMessage = parsedStructured
      ? parsedStructured.description
      : error.message || getUserFailure(error.message).description;

    const hasMapped = Object.keys(mapped).length > 0;
    const globalError =
      unmappedMessages.length > 0
        ? unmappedMessages.join(' ')
        : hasMapped
          ? null
          : readableMessage;

    return { fieldErrors: mapped, globalError };
  }

  if (error instanceof Error && error.message) {
    return { fieldErrors: {}, globalError: error.message };
  }

  return { fieldErrors: {}, globalError: fallbackMessage };
}

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\/api$/, '');
}

async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const hasBody = init?.body !== undefined && init?.body !== null;
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 401 && !isRetry && !path.startsWith('/api/auth/')) {
    const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    }).catch(() => null);

    if (refreshRes?.ok) {
      return request<T>(path, init, true);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      body?.message || `Request failed (${response.status})`,
      response.status,
      body
    );
  }

  if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'data')) {
    throw new ApiError('The server returned an invalid response.', response.status, {
      error: 'INVALID_API_RESPONSE',
    });
  }
  return body.data as T;
}

export const api = {
  getMe(): Promise<UserDto | null> {
    return request<UserDto | null>('/api/auth/me').catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    });
  },

  login(input: { email: string; password: string }): Promise<UserDto> {
    return request<UserDto>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  register(input: {
    email: string;
    password: string;
    name?: string;
    timezone?: string;
  }): Promise<UserDto> {
    return request<UserDto>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateProfile(input: {
    name?: string | null;
    timezone?: string;
    pageLanguage?: string | null;
    browserPageLanguage?: string | null;
  }): Promise<UserDto> {
    return request<UserDto>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  logout(): Promise<void> {
    return request<void>('/api/auth/logout', {
      method: 'POST',
    });
  },

  getGoogleAuthUrl(): string {
    return `${getApiBaseUrl()}/api/auth/google`;
  },

  getStats(): Promise<DashboardStats> {
    return request<DashboardStats>('/api/stats');
  },

  listJobs(
    options: {
      page?: number;
      pageSize?: number;
      status?: JobStatusFilter;
      search?: string;
    } = {}
  ): Promise<PaginatedResponse<ScrapingJobDto>> {
    const params = new URLSearchParams();
    if (options.page !== undefined) params.set('page', String(options.page));
    if (options.pageSize !== undefined) params.set('pageSize', String(options.pageSize));
    if (options.status) params.set('status', options.status);
    if (options.search?.trim()) params.set('search', options.search.trim());
    return request<PaginatedResponse<ScrapingJobDto>>(`/api/jobs?${params.toString()}`);
  },

  probeUrl(url: string): Promise<ProbeUrlDto> {
    return request<ProbeUrlDto>('/api/jobs/probe', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  createJob(input: CreateJobRequest): Promise<ScrapingJobDto> {
    return request<ScrapingJobDto>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateJob(id: string, input: UpdateJobRequest): Promise<ScrapingJobDto> {
    return request<ScrapingJobDto>(`/api/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  togglePause(id: string, paused: boolean): Promise<ScrapingJobDto> {
    return request<ScrapingJobDto>(`/api/jobs/${id}/pause`, {
      method: 'PATCH',
      body: JSON.stringify({ paused }),
    });
  },

  triggerNow(id: string): Promise<TriggerJobDto> {
    return request<TriggerJobDto>(`/api/jobs/${id}/trigger`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  triggerRecompile(id: string): Promise<ScrapingJobDto> {
    return request<ScrapingJobDto>(`/api/jobs/${id}/recompile`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  cancelCompilation(id: string): Promise<ScrapingJobDto> {
    return request<ScrapingJobDto>(`/api/jobs/${id}/cancel-compilation`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  getJobVersions(
    id: string,
    page = 1,
    pageSize: number = PAGINATION_DEFAULT_PAGE_SIZE
  ): Promise<JobPlanVersionsDto> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    return request<JobPlanVersionsDto>(`/api/jobs/${id}/versions?${params.toString()}`);
  },

  rollbackJobVersion(id: string, versionNumber: number): Promise<ScrapingJobDto> {
    return request<ScrapingJobDto>(`/api/jobs/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ versionNumber }),
    });
  },

  deleteJob(id: string): Promise<void> {
    return request<void>(`/api/jobs/${id}`, {
      method: 'DELETE',
    });
  },

  getIntegrations(): Promise<UserIntegrationsDto> {
    return request<UserIntegrationsDto>('/api/integrations');
  },

  updateIntegrations(input: UpdateIntegrationsRequest): Promise<UserIntegrationsDto> {
    return request<UserIntegrationsDto>('/api/integrations', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  testTelegram(input: { chatId: string }): Promise<NotificationTestDto> {
    return request<NotificationTestDto>('/api/integrations/telegram/test', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  testWebhook(input: { webhookUrl: string; secret?: string | null }): Promise<NotificationTestDto> {
    return request<NotificationTestDto>('/api/integrations/webhook/test', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getJobRuns(
    id: string,
    page = 1,
    pageSize: number = PAGINATION_RUNS_PAGE_SIZE
  ): Promise<JobRunsDto> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    return request<JobRunsDto>(`/api/jobs/${id}/runs?${params.toString()}`);
  },

  getJobTimeseries(
    id: string,
    range: TimeseriesRange = 'all',
    page = 1,
    pageSize: number = PAGINATION_TIMESERIES_PAGE_SIZE
  ): Promise<JobTimeseriesDto> {
    const params = new URLSearchParams({ range, page: String(page), pageSize: String(pageSize) });
    return request<JobTimeseriesDto>(`/api/jobs/${id}/timeseries?${params.toString()}`);
  },

  getSessions(
    page = 1,
    pageSize: number = PAGINATION_DEFAULT_PAGE_SIZE
  ): Promise<PaginatedResponse<SessionDto>> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return request<PaginatedResponse<SessionDto>>(`/api/sessions?${params.toString()}`);
  },

  checkSession(domainOrUrl: string): Promise<SessionCheckDto> {
    return request<SessionCheckDto>(
      `/api/sessions/check?url=${encodeURIComponent(domainOrUrl)}`
    );
  },

  deleteSession(id: string): Promise<void> {
    return request<void>(`/api/sessions/${id}`, {
      method: 'DELETE',
    });
  },

  getUserQuotas(): Promise<UserQuotaSummary> {
    return request<UserQuotaSummary>('/api/quotas');
  },
};
