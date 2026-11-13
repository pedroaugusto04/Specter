import type {
  CreateJobRequest,
  DashboardStatsDto as DashboardStats,
  JobRunsDto,
  JobTimeseriesDto,
  JobStatus,
  MetricQuotaSummary,
  ProbeUrlDto,
  ScrapingJobDto,
  SessionDto,
  TimeseriesRange,
  UpdateIntegrationsRequest,
  UpdateJobRequest,
  UserDto,
  UserIntegrationsDto,
  UserQuotaSummary,
} from '@specter/contracts';
export type { ChangeStatus, ExtractionQuality, JobStatus, RunStatus } from './domainValues';
export type {
  JobRunsDto,
  JobTimeseriesDto,
  JobTimeseriesPointDto,
  TimeseriesRange,
} from '@specter/contracts';
export type {
  ExtractionPlan,
  TriggerMatchMode,
  TriggerOperator,
  TriggerRule,
} from './extractionPlan';

export type {
  DashboardStatsDto as DashboardStats,
  DiffChangeEntry,
  DiffSummary,
  JobRunDto,
  MetricQuotaSummary,
  ScrapingJobDto,
  SessionDto,
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

  constructor(
    message: string,
    status: number,
    data?: {
      error?: string;
      message?: string;
      details?: ApiValidationErrorDetail[];
      fields?: Record<string, string>;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = data?.error;
    this.details = data?.details;
    this.fieldErrors = { ...(data?.fields ?? {}) };
  }
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
    return request<UserDto | null>('/api/auth/me');
  },

  login(input: { email: string; password: string }): Promise<UserDto> {
    return request<UserDto>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  register(input: { email: string; password: string; name?: string }): Promise<UserDto> {
    return request<UserDto>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateProfile(input: { name?: string | null; timezone?: string }): Promise<UserDto> {
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

  listJobs(status?: JobStatus): Promise<ScrapingJobDto[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<ScrapingJobDto[]>(`/api/jobs${query}`);
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

  triggerNow(id: string): Promise<{ queued: boolean; mode: 'scrape' | 'compile' }> {
    return request<{ queued: boolean; mode: 'scrape' | 'compile' }>(`/api/jobs/${id}/trigger`, {
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

  testTelegram(input: { chatId: string }): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>('/api/integrations/telegram/test', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  testWebhook(input: {
    webhookUrl: string;
    secret?: string | null;
  }): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>('/api/integrations/webhook/test', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getJobRuns(id: string, page = 1, pageSize = 20): Promise<JobRunsDto> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    return request<JobRunsDto>(`/api/jobs/${id}/runs?${params.toString()}`);
  },

  getJobTimeseries(id: string, range: TimeseriesRange = 'all'): Promise<JobTimeseriesDto> {
    return request<JobTimeseriesDto>(`/api/jobs/${id}/timeseries?range=${range}`);
  },

  getSessions(): Promise<SessionDto[]> {
    return request<SessionDto[]>('/api/sessions');
  },

  checkSession(domainOrUrl: string): Promise<{ hasSession: boolean; session: SessionDto | null }> {
    return request<{ hasSession: boolean; session: SessionDto | null }>(
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
