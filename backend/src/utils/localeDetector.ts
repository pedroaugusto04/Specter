import { resolveTargetCountry } from './geoTarget.js';

/**
 * Standard locale defaults for common languages when region is not explicitly specified.
 */
const LANGUAGE_DEFAULT_LOCALES: Record<string, string> = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ko: 'ko-KR',
  nl: 'nl-NL',
  ru: 'ru-RU',
};

/**
 * Country to primary locale mapping when only country is inferred (e.g. from ccTLD).
 */
const COUNTRY_TO_LOCALE: Record<string, string> = {
  BR: 'pt-BR',
  GB: 'en-GB',
  US: 'en-US',
  DE: 'de-DE',
  FR: 'fr-FR',
  ES: 'es-ES',
  IT: 'it-IT',
  JP: 'ja-JP',
  CN: 'zh-CN',
  IN: 'en-IN',
  CA: 'en-CA',
  AU: 'en-AU',
  MX: 'es-MX',
  AR: 'es-AR',
  PT: 'pt-PT',
  NL: 'nl-NL',
  RU: 'ru-RU',
  KR: 'ko-KR',
};

export interface DocumentLocaleInput {
  html?: string;
  url?: string;
}

/**
 * Normalizes a raw locale/language tag into a canonical, Intl-compatible BCP-47 tag.
 * Returns undefined if the tag cannot be parsed or validated by Intl.NumberFormat.
 */
export function normalizeLocaleTag(tag?: string | null): string | undefined {
  if (!tag || typeof tag !== 'string') return undefined;
  const cleaned = tag.trim().replace(/_/g, '-');
  if (!cleaned) return undefined;

  const parts = cleaned.split('-');
  const [part0, part1] = parts;
  if (!part0) return undefined;

  let candidate: string;
  if (parts.length === 1 || !part1) {
    const lang = part0.toLowerCase();
    candidate = LANGUAGE_DEFAULT_LOCALES[lang] || lang;
  } else {
    candidate = `${part0.toLowerCase()}-${part1.toUpperCase()}`;
  }

  try {
    new Intl.NumberFormat(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

/**
 * Extracts a locale from HTML content by inspecting <html lang="...">,
 * <meta> language tags, OpenGraph locale, and characteristic currency symbols.
 */
function extractLocaleFromHtml(html: string): string | undefined {
  if (!html) return undefined;

  // Search head/top document region for meta & html tags
  const headerSlice = html.slice(0, 50000);

  // 1. <html ... lang="pt-br" ...> or xml:lang
  const htmlLangMatch =
    headerSlice.match(/<html[^>]*\blang=["']([^"']+)["']/i) ||
    headerSlice.match(/<html[^>]*\bxml:lang=["']([^"']+)["']/i);
  if (htmlLangMatch?.[1]) {
    const normalized = normalizeLocaleTag(htmlLangMatch[1]);
    if (normalized) return normalized;
  }

  // 2. OpenGraph locale: <meta property="og:locale" content="pt_BR">
  const ogLocaleMatch =
    headerSlice.match(/<meta[^>]*\bproperty=["']og:locale["'][^>]*\bcontent=["']([^"']+)["']/i) ||
    headerSlice.match(/<meta[^>]*\bcontent=["']([^"']+)["'][^>]*\bproperty=["']og:locale["']/i);
  if (ogLocaleMatch?.[1]) {
    const normalized = normalizeLocaleTag(ogLocaleMatch[1]);
    if (normalized) return normalized;
  }

  // 3. Content-Language: <meta http-equiv="content-language" content="pt-br">
  const contentLangMatch =
    headerSlice.match(
      /<meta[^>]*\bhttp-equiv=["']content-language["'][^>]*\bcontent=["']([^"']+)["']/i
    ) ||
    headerSlice.match(
      /<meta[^>]*\bcontent=["']([^"']+)["'][^>]*\bhttp-equiv=["']content-language["']/i
    );
  if (contentLangMatch?.[1]) {
    const normalized = normalizeLocaleTag(contentLangMatch[1]);
    if (normalized) return normalized;
  }

  // 4. Currency markers in document (BRL R$, EUR €, GBP £, etc.)
  const contentSlice = html.slice(0, 100000);
  if (/(?:R\$\s*\d|\d\s*R\$)/i.test(contentSlice) || /\bBRL\b/i.test(headerSlice)) {
    return 'pt-BR';
  }
  if (/(?:£\s*\d|\d\s*£)/.test(contentSlice) || /\bGBP\b/i.test(headerSlice)) {
    return 'en-GB';
  }
  if (/(?:€\s*\d|\d\s*€)/.test(contentSlice) || /\bEUR\b/i.test(headerSlice)) {
    return 'de-DE';
  }
  if (/(?:¥\s*\d|\d\s*¥)/.test(contentSlice) || /\bJPY\b/i.test(headerSlice)) {
    return 'ja-JP';
  }
  if (/(?:₹\s*\d|\d\s*₹)/.test(contentSlice) || /\bINR\b/i.test(headerSlice)) {
    return 'en-IN';
  }

  return undefined;
}

/**
 * Detects the document locale from snapshot / HTML / URL.
 * Falls back to 'en-US' if no signals can be derived.
 */
export function detectDocumentLocale(
  input?: DocumentLocaleInput | string | null
): string {
  if (!input) return 'en-US';

  const doc: DocumentLocaleInput =
    typeof input === 'string'
      ? input.startsWith('http://') || input.startsWith('https://')
        ? { url: input }
        : { html: input }
      : input;

  // 1. Try HTML language and currency detection
  if (doc.html) {
    const htmlLocale = extractLocaleFromHtml(doc.html);
    if (htmlLocale) return htmlLocale;
  }

  // 2. Try URL ccTLD country mapping
  if (doc.url) {
    const country = resolveTargetCountry(doc.url);
    if (country && COUNTRY_TO_LOCALE[country]) {
      return COUNTRY_TO_LOCALE[country];
    }
  }

  // 3. Default fallback
  return 'en-US';
}
