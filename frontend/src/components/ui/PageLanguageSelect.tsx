'use client';

import * as React from 'react';
import { DEFAULT_PAGE_LANGUAGE, getBrowserPageLanguage, normalizePageLanguage } from '@/lib/pageLanguage';
import { SearchablePreference } from './SearchablePreference';

// ISO 639-1 languages and frequently used regional variants. Other BCP 47 tags can be typed.
const languageTags = (
  'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy ' +
  'da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu ' +
  'hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb ' +
  'lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om ' +
  'or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ' +
  'ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu ' +
  'ar-SA bn-BD de-AT de-CH de-DE en-AU en-CA en-GB en-IN en-NZ en-US en-ZA ' +
  'es-419 es-AR es-CL es-CO es-ES es-MX es-US fr-BE fr-CA fr-CH fr-FR hi-IN id-ID ' +
  'it-IT ja-JP ko-KR nl-BE nl-NL pl-PL pt-BR pt-PT ru-RU sr-Cyrl sr-Latn th-TH ' +
  'tr-TR uk-UA vi-VN zh-CN zh-HK zh-TW zh-Hans zh-Hant'
).split(' ');

function describeLanguage(value: string) {
  const label = new Intl.DisplayNames(['en'], { type: 'language', languageDisplay: 'standard' }).of(value);
  return { value, label: label && label !== value ? `${label} (${value})` : value };
}

function customLanguage(query: string) {
  // Require a complete-looking tag so ordinary language name searches stay clear.
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})+$/i.test(query)) return undefined;
  const tag = normalizePageLanguage(query);
  return tag ? describeLanguage(tag) : undefined;
}

export function PageLanguageSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [browserLanguage, setBrowserLanguage] = React.useState(DEFAULT_PAGE_LANGUAGE);
  React.useEffect(() => {
    setBrowserLanguage(getBrowserPageLanguage() ?? DEFAULT_PAGE_LANGUAGE);
  }, []);
  const options = React.useMemo(() => {
    const tags = new Set([...languageTags, browserLanguage]);
    if (value) tags.add(value);
    return Array.from(tags, describeLanguage).sort((a, b) => a.label.localeCompare(b.label, 'en'));
  }, [browserLanguage, value]);

  return (
    <SearchablePreference
      id={id}
      value={value ?? ''}
      onChange={(selection) => onChange(selection || null)}
      disabled={disabled}
      options={options}
      browserOption={{
        value: '',
        label: 'Use browser language',
        detail: describeLanguage(browserLanguage).label,
      }}
      searchPlaceholder="Search by language or code..."
      noResults="No languages found"
      customOption={customLanguage}
    />
  );
}
