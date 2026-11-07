import { env } from '../../../config/env.js';
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

export async function checkScraperApiQuota(
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ProviderQuotaInfo> {
  const provider = 'scraperapi';
  if (!apiKey || apiKey.trim().length === 0) {
    return { provider, enabled: false };
  }

  try {
    const url = new URL('https://api.scraperapi.com/account');
    url.searchParams.set('api_key', apiKey.trim());

    const res = await fetchFn(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        provider,
        enabled: true,
        error: `HTTP ${res.status}: ${body.slice(0, 100)}`,
      };
    }

    const data = (await res.json()) as {
      requestLimit?: number;
      requestCount?: number;
      concurrencyLimit?: number;
    };

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
  } catch (err) {
    return {
      provider,
      enabled: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkScrapingBeeQuota(
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ProviderQuotaInfo> {
  const provider = 'scrapingbee';
  if (!apiKey || apiKey.trim().length === 0) {
    return { provider, enabled: false };
  }

  try {
    const url = new URL('https://app.scrapingbee.com/api/v1/usage');
    url.searchParams.set('api_key', apiKey.trim());

    const res = await fetchFn(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        provider,
        enabled: true,
        error: `HTTP ${res.status}: ${body.slice(0, 100)}`,
      };
    }

    const data = (await res.json()) as {
      max_api_credit?: number;
      used_api_credit?: number;
    };

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
  } catch (err) {
    return {
      provider,
      enabled: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
    const url = new URL('https://api.crawlbase.com/');
    url.searchParams.set('token', token.trim());
    url.searchParams.set('account', 'true');

    const res = await fetchFn(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        provider,
        enabled: true,
        error: `HTTP ${res.status}: ${body.slice(0, 100)}`,
      };
    }

    const data = (await res.json()) as {
      remaining_requests?: number;
      total_requests?: number;
      requests_count?: number;
    };

    const remaining = data.remaining_requests;
    const limit = data.total_requests;
    const used = data.requests_count;

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
      error: err instanceof Error ? err.message : String(err),
    };
  }
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

  if (env.HTTP_PROXY) {
    const parsed = parseProxyConfig(env.HTTP_PROXY);
    const masked = parsed
      ? `${parsed.server}${parsed.username ? ` (user: ${parsed.username})` : ''}`
      : 'HTTP/HTTPS proxy configured';
    results.push({
      provider: 'http_proxy',
      enabled: true,
      details: `Active proxy tunnel: ${masked}`,
    });
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
