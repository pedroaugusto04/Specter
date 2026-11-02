export type JobStatus =
  | 'PENDING_COMPILATION'
  | 'ACTIVE'
  | 'FAILED'
  | 'HEALING'
  | 'PAUSED';

export type RunStatus = 'SUCCESS' | 'FAILED';
export type ChangeStatus = 'YES' | 'NO' | 'INITIAL';

export interface FieldExtractor {
  selector: string;
  attribute?: 'text' | 'href' | 'src' | string;
  type?: 'string' | 'number' | 'boolean';
}

export type TriggerOperator =
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains';

export interface TriggerRule {
  field: string;
  operator: TriggerOperator;
  value: string | number | boolean;
}

export interface ExtractorConfig {
  containerSelector?: string;
  fields: Record<string, string | FieldExtractor>;
  paginationSelector?: string;
  triggerRules?: TriggerRule[];
  triggerMatchMode?: 'any' | 'all';
}

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface ScrapingJobDto {
  id: string;
  userId: string;
  url: string;
  userPrompt: string;
  notificationEmail: string;
  webhookUrl?: string | null;
  cronExpression: string;
  extractorConfig: ExtractorConfig | null;
  status: JobStatus;
  lastError: string | null;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunDto {
  id: string;
  jobId: string;
  extractedData: Record<string, unknown> | null;
  normalizedHash: string | null;
  hasChanges: ChangeStatus;
  status: RunStatus;
  errorMessage: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  executedAt: string;
}

export interface DiffChangeEntry {
  field: string;
  changeType: 'ADDED' | 'MODIFIED' | 'REMOVED';
  previousValue: unknown;
  currentValue: unknown;
}

export interface DiffSummary {
  hasChanges: boolean;
  totalChanges: number;
  added: DiffChangeEntry[];
  modified: DiffChangeEntry[];
  removed: DiffChangeEntry[];
  summaryText: string;
  summaryHtml: string;
}

export interface DashboardStats {
  totalJobs: number;
  activeJobs: number;
  healingOrCompilingJobs: number;
  failedOrPausedJobs: number;
  totalRuns: number;
  DetectedChangesCount: number;
}

export interface UserIntegrationsDto {
  id?: string;
  userId?: string;
  telegramEnabled: boolean;
  telegramChatId?: string | null;
  webhookEnabled: boolean;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
}

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
    if (data?.details && Object.keys(this.fieldErrors).length === 0) {
      for (const item of data.details) {
        if (item.field && item.message && !this.fieldErrors[item.field]) {
          this.fieldErrors[item.field] = item.message;
        }
      }
    }
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Dynamically detect context: if loaded on /scrapper (dev/staging), route API calls to /scrapper
    if (window.location.pathname.startsWith('/scrapper')) {
      return '/scrapper';
    }
    // In production root (specterdev.online), route API calls to root (/api)
    const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (envUrl) {
      return envUrl.replace(/\/$/, '').replace(/\/api$/, '');
    }
    return '';
  }
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '').replace(/\/api$/, '');
  }
  return 'http://localhost:3001';
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

  updateProfile(input: { name?: string | null }): Promise<UserDto> {
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

  probeUrl(url: string): Promise<{ accessible: boolean; reason?: string }> {
    return request<{ accessible: boolean; reason?: string }>('/api/jobs/probe', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  createJob(input: {
    url: string;
    userPrompt: string;
    notificationEmail: string;
    webhookUrl?: string | null;
    cronExpression: string;
  }): Promise<ScrapingJobDto> {
    return request<ScrapingJobDto>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateJob(
    id: string,
    input: {
      url?: string;
      userPrompt?: string;
      notificationEmail?: string;
      webhookUrl?: string | null;
      cronExpression?: string;
      triggerRules?: TriggerRule[];
      triggerMatchMode?: 'any' | 'all';
    }
  ): Promise<ScrapingJobDto> {
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

  updateIntegrations(input: {
    telegramEnabled: boolean;
    telegramChatId?: string | null;
    webhookEnabled: boolean;
    webhookUrl?: string | null;
    webhookSecret?: string | null;
  }): Promise<UserIntegrationsDto> {
    return request<UserIntegrationsDto>('/api/integrations', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  testTelegram(input: {
    chatId: string;
  }): Promise<{ success: boolean; message: string }> {
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

  getJobRuns(id: string): Promise<{ runs: JobRunDto[]; latestDiff: DiffSummary | null }> {
    return request<{ runs: JobRunDto[]; latestDiff: DiffSummary | null }>(`/api/jobs/${id}/runs`);
  },
};
