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

export interface ExtractorConfig {
  containerSelector?: string;
  fields: Record<string, string | FieldExtractor>;
  paginationSelector?: string;
}

export interface ScrapingJobDto {
  id: string;
  userId: string;
  url: string;
  userPrompt: string;
  notificationEmail: string;
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

function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '').replace(/\/api$/, '');
  }
  if (typeof window !== 'undefined') {
    return '/scrapper';
  }
  return 'http://localhost:3001';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const hasBody = init?.body !== undefined && init?.body !== null;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> ?? {}),
  };

  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

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
      cronExpression?: string;
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

  getJobRuns(id: string): Promise<{ runs: JobRunDto[]; latestDiff: DiffSummary | null }> {
    return request<{ runs: JobRunDto[]; latestDiff: DiffSummary | null }>(`/api/jobs/${id}/runs`);
  },
};
