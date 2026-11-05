/** ccTLDs commonly used as generic domains; they say nothing about the audience country. */
const GENERIC_USE_CCTLDS = new Set([
  'ai',
  'cc',
  'co',
  'fm',
  'gg',
  'io',
  'ly',
  'me',
  'sh',
  'to',
  'tv',
  'vc',
  'ws',
]);

const TLD_TO_COUNTRY_EXCEPTIONS: Record<string, string> = { uk: 'GB' };

/**
 * Infers the ISO 3166-1 alpha-2 country a target site expects its visitors to come from,
 * based on the country-code TLD (e.g. `.com.br` -> `BR`). Returns undefined for generic TLDs.
 */
export function resolveTargetCountry(targetUrl: string): string | undefined {
  let hostname: string;
  try {
    hostname = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  const tld = hostname.split('.').at(-1);
  if (!tld || tld.length !== 2 || GENERIC_USE_CCTLDS.has(tld)) return undefined;
  return TLD_TO_COUNTRY_EXCEPTIONS[tld] ?? tld.toUpperCase();
}
