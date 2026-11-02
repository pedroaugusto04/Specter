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
