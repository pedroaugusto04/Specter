import { ValidationError } from '../errors/domainErrors.js';

export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ValidationError(
        'Only HTTP and HTTPS protocols are permitted.',
        [{ field: 'url', message: 'Target URL must start with http:// or https://' }]
      );
    }
    parsed.hash = '';
    return parsed.toString();
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
    throw new ValidationError(
      `Invalid URL: "${rawUrl}"`,
      [{ field: 'url', message: 'Target URL must be a valid URL format (e.g. https://example.com)' }],
      err
    );
  }
}

export function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
  const firstPart = withoutProtocol.split('/')[0] ?? '';
  const hostOnly = firstPart.split(':')[0] ?? '';
  if (!hostOnly || hostOnly.includes(' ')) {
    throw new ValidationError('Invalid domain format.', [
      { field: 'domain', message: 'Domain must be a valid host or URL.' },
    ]);
  }
  return hostOnly;
}

export function extractDomainCandidates(hostnameOrUrl: string): string[] {
  const withoutProtocol = hostnameOrUrl.trim().toLowerCase().replace(/^https?:\/\//, '');
  const firstSlash = withoutProtocol.split('/')[0] ?? '';
  const clean = firstSlash.split(':')[0] ?? '';
  if (!clean) return [];

  const candidates: string[] = [clean];
  const parts = clean.split('.');

  // If host is sub.domain.com, candidates are ['sub.domain.com', 'domain.com']
  if (parts.length > 2) {
    const rootDomain = parts.slice(-2).join('.');
    if (!candidates.includes(rootDomain)) {
      candidates.push(rootDomain);
    }
  }

  return candidates;
}
