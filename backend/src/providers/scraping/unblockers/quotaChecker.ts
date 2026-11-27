import { env } from '../../../config/env.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { logger } from '../../../utils/logger.js';
import { parseProxyConfig } from '../../../utils/proxyParser.js';

export interface ProviderQuotaInfo {
  provider: string;
  enabled: boolean;
  limit?: number;
  used?: number;
  remaining?: number;
  details?: string;
  error?: string;
}

async function fetchProviderAccount<T>(
  provider: string,
  apiKey: string,
  urlStr: string,
  fetchFn: typeof fetch
): Promise<{ ok: true; data: T } | { ok: false; info: ProviderQuotaInfo }> {
  if (!apiKey || apiKey.trim().length === 0) {
    return { ok: false, info: { provider, enabled: false } };
  }

  try {
    const res = await fetchFn(urlStr, {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        info: {
          provider,
          enabled: true,
          error: `HTTP ${res.status}: ${body.slice(0, 100)}`,
        },
      };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      info: {
        provider,
        enabled: true,
        error: getErrorMessage(err),
      },
    };
  }
}

export async function checkScraperApiQuota(
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ProviderQuotaInfo> {
  const provider = 'scraperapi';
  const url = new URL('https://api.scraperapi.com/account');
  url.searchParams.set('api_key', apiKey ? apiKey.trim() : '');

  const result = await fetchProviderAccount<{
    requestLimit?: number;
    requestCount?: number;
    concurrencyLimit?: number;
  }>(provider, apiKey, url.toString(), fetchFn);

  if (!result.ok) return result.info;

  const data = result.data;
  const limit = data.requestLimit ?? 0;
  const used = data.requestCount ?? 0;
  const remaining = Math.max(0, limit - used);

  return {
    provider,
    enabled: true,
    limit,
    used,
    remaining,
    details: `${remaining} / ${limit} requests remaining (concurrency: ${data.concurrencyLimit ?? 'N/A'})`,
  };
}

export async function checkScrapingBeeQuota(
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ProviderQuotaInfo> {
  const provider = 'scrapingbee';
  const url = new URL('https://app.scrapingbee.com/api/v1/usage');
  url.searchParams.set('api_key', apiKey ? apiKey.trim() : '');

  const result = await fetchProviderAccount<{
    max_api_credit?: number;
    used_api_credit?: number;
  }>(provider, apiKey, url.toString(), fetchFn);

  if (!result.ok) return result.info;

  const data = result.data;
  const limit = data.max_api_credit ?? 0;
  const used = data.used_api_credit ?? 0;
  const remaining = Math.max(0, limit - used);

  return {
    provider,
    enabled: true,
    limit,
    used,
    remaining,
    details: `${remaining} / ${limit} credits remaining`,
  };
}

export async function checkCrawlbaseQuota(
  token: string,
  fetchFn: typeof fetch = fetch
): Promise<ProviderQuotaInfo> {
  const provider = 'crawlbase';
  if (!token || token.trim().length === 0) {
    return { provider, enabled: false };
  }

  try {
    const url = new URL('https://api.crawlbase.com/account');
    url.searchParams.set('token', token.trim());
    url.searchParams.set('product', 'crawling-api');

    const res = await fetchFn(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 429 || body.includes('Rate limit exceeded')) {
        return {
          provider,
          enabled: true,
          details: 'Active Crawlbase account connected (rate limited on account stats API: 1 req/5 min)',
        };
      }
      return {
        provider,
        enabled: true,
        error: `HTTP ${res.status}: ${body.slice(0, 100)}`,
      };
    }

    const data = (await res.json()) as {
      remainingCredits?: number;
      remaining_requests?: number;
      totalSuccess?: number;
      total_requests?: number;
      totalFailed?: number;
      requests_count?: number;
      error?: string;
    };

    if (data.error && data.error.includes('Rate limit')) {
      return {
        provider,
        enabled: true,
        details: 'Active Crawlbase account connected (rate limited on account stats API)',
      };
    }

    const remaining = data.remainingCredits ?? data.remaining_requests;
    const limit = data.total_requests;
    const used = data.totalSuccess ?? data.requests_count;

    return {
      provider,
      enabled: true,
      limit,
      used,
      remaining,
      details:
        remaining !== undefined
          ? `${remaining} requests remaining`
          : 'Active Crawlbase account connected',
    };
  } catch (err) {
    return {
      provider,
      enabled: true,
      error: getErrorMessage(err),
    };
  }
}

function buildProxyQuotaInfo(
  provider: string,
  proxyUrl: string,
  label: string,
  fallback: string
): ProviderQuotaInfo {
  const parsed = parseProxyConfig(proxyUrl);
  const masked = parsed
    ? `${parsed.server}${parsed.username ? ` (user: ${parsed.username})` : ''}`
    : fallback;
  return {
    provider,
    enabled: true,
    details: `${label}: ${masked}`,
  };
}

export async function checkAllProviderQuotas(
  fetchFn: typeof fetch = fetch
): Promise<ProviderQuotaInfo[]> {
  const results: ProviderQuotaInfo[] = [];

  if (env.SCRAPERAPI_KEY) {
    results.push(await checkScraperApiQuota(env.SCRAPERAPI_KEY, fetchFn));
  }

  if (env.SCRAPINGBEE_API_KEY) {
    results.push(await checkScrapingBeeQuota(env.SCRAPINGBEE_API_KEY, fetchFn));
  }

  if (env.CRAWLBASE_TOKEN) {
    results.push(await checkCrawlbaseQuota(env.CRAWLBASE_TOKEN, fetchFn));
  }

  if (env.ZENROWS_API_KEY) {
    results.push({
      provider: 'zenrows',
      enabled: true,
      details: 'Active (credit balance monitored per request)',
    });
  }

  if (env.DECODO_API_KEY) {
    results.push({
      provider: 'decodo',
      enabled: true,
      details: 'Active (Decodo Web Data API with per-request quota headers)',
    });
  }

  if (env.HTTP_PROXY) {
    results.push(
      buildProxyQuotaInfo(
        'http_proxy',
        env.HTTP_PROXY,
        'Active primary proxy tunnel',
        'HTTP/HTTPS proxy configured'
      )
    );
  }

  if (env.HTTP_FALLBACK_PROXY) {
    results.push(
      buildProxyQuotaInfo(
        'http_fallback_proxy',
        env.HTTP_FALLBACK_PROXY,
        'Active fallback proxy tunnel',
        'HTTP/HTTPS fallback proxy configured'
      )
    );
  }

  return results;
}

export async function logProviderQuotasOnStartup(fetchFn: typeof fetch = fetch): Promise<void> {
  const quotas = await checkAllProviderQuotas(fetchFn);

  if (quotas.length === 0) {
    logger.info(
      'Unblocker status: No external anti-bot unblocker or proxy configured (using local Playwright browser)'
    );
    return;
  }

  for (const info of quotas) {
    if (info.error) {
      logger.warn(`Unblocker quota check failed for ${info.provider}`, {
        provider: info.provider,
        error: info.error,
      });
    } else {
      logger.info(`Unblocker quota status for ${info.provider}`, {
        provider: info.provider,
        remaining: info.remaining,
        limit: info.limit,
        used: info.used,
        details: info.details,
      });
    }
  }
}
