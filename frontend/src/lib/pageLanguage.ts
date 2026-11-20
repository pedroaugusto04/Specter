export const DEFAULT_PAGE_LANGUAGE = 'pt-BR';

export function normalizePageLanguage(value: string): string | undefined {
  if (value.length > 64) return undefined;
  try {
    return new Intl.Locale(value).baseName;
  } catch {
    return undefined;
  }
}

export function getBrowserPageLanguage(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return [navigator.language, ...(navigator.languages ?? [])]
    .map((language) => language && normalizePageLanguage(language))
    .find((language): language is string => Boolean(language));
}
