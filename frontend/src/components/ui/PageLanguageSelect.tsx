'use client';

import * as React from 'react';
import { DEFAULT_PAGE_LANGUAGE, getBrowserPageLanguage, normalizePageLanguage } from '@/lib/pageLanguage';
import { SearchablePreference } from './SearchablePreference';

/**
 * Curated list of common languages and regional variants used across websites on the web.
 * Users can also search or type any standard BCP 47 language tag directly.
 */
const CURATED_LANGUAGE_TAGS = [
  'pt-BR', 'pt-PT', 'pt',
  'en-US', 'en-GB', 'en-CA', 'en-AU', 'en',
  'es-ES', 'es-419', 'es-MX', 'es-AR', 'es-CO', 'es-CL', 'es',
  'fr-FR', 'fr-CA', 'fr-BE', 'fr-CH', 'fr',
  'de-DE', 'de-AT', 'de-CH', 'de',
  'it-IT', 'it',
  'ja-JP', 'ja',
  'zh-CN', 'zh-TW', 'zh-HK', 'zh',
  'ko-KR', 'ko',
  'ru-RU', 'ru',
  'ar-SA', 'ar',
  'hi-IN', 'hi',
  'nl-NL', 'nl-BE', 'nl',
  'pl-PL', 'pl',
  'tr-TR', 'tr',
  'uk-UA', 'uk',
  'sv-SE', 'sv',
  'nb-NO', 'no',
  'da-DK', 'da',
  'fi-FI', 'fi',
  'el-GR', 'el',
  'cs-CZ', 'cs',
  'hu-HU', 'hu',
  'ro-RO', 'ro',
  'id-ID', 'id',
  'vi-VN', 'vi',
  'th-TH', 'th',
  'he-IL', 'he',
  'bn-BD', 'bn',
];

export function describeLanguage(value: string): { value: string; label: string; searchText: string } {
  let englishLabel = value;
  let ptLabel = '';
  let nativeLabel = '';

  try {
    const enDisplay = new Intl.DisplayNames(['en'], { type: 'language', languageDisplay: 'standard' });
    englishLabel = enDisplay.of(value) || value;
  } catch {
    englishLabel = value;
  }

  try {
    const ptDisplay = new Intl.DisplayNames(['pt-BR'], { type: 'language', languageDisplay: 'standard' });
    ptLabel = ptDisplay.of(value) || '';
  } catch {
    ptLabel = '';
  }

  try {
    const nativeDisplay = new Intl.DisplayNames([value], { type: 'language', languageDisplay: 'standard' });
    nativeLabel = nativeDisplay.of(value) || '';
  } catch {
    nativeLabel = '';
  }

  const label = englishLabel && englishLabel !== value ? `${englishLabel} (${value})` : value;
  const searchText = `${value} ${englishLabel} ${ptLabel} ${nativeLabel}`.trim();

  return { value, label, searchText };
}

function customLanguage(query: string) {
  const normalized = query.trim().replace(/_/g, '-');
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(normalized)) return undefined;
  const tag = normalizePageLanguage(normalized);
  return tag ? describeLanguage(tag) : undefined;
}

export interface PageLanguageSelectProps {
  id?: string;
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function PageLanguageSelect({
  id,
  value,
  onChange,
  disabled = false,
  className,
}: PageLanguageSelectProps) {
  const browserLanguage = React.useMemo(() => getBrowserPageLanguage() ?? DEFAULT_PAGE_LANGUAGE, []);
  const effectiveValue = value || browserLanguage;

  const options = React.useMemo(() => {
    const tags = new Set([...CURATED_LANGUAGE_TAGS, browserLanguage]);
    if (value) tags.add(value);
    return Array.from(tags, describeLanguage).sort((a, b) => a.label.localeCompare(b.label, 'en'));
  }, [browserLanguage, value]);

  const browserDetail = React.useMemo(
    () => describeLanguage(browserLanguage).label,
    [browserLanguage]
  );

  return (
    <SearchablePreference
      id={id}
      value={effectiveValue}
      onChange={onChange}
      disabled={disabled}
      className={className}
      options={options}
      browserOption={{
        value: browserLanguage,
        label: 'Use browser language',
        detail: browserDetail,
      }}
      searchPlaceholder="Search by language or code..."
      noResults="No languages found"
      customOption={customLanguage}
    />
  );
}
