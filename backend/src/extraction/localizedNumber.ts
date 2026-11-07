interface NumberNotation {
  decimal: string;
  group: string;
  primary: number;
  secondary: number;
  digits: Array<[string, string]>;
}
const CURRENCY_MARKERS = [
  'US$',
  'CA$',
  'AU$',
  'NZ$',
  'HK$',
  'MX$',
  'NT$',
  'R$',
  'A$',
  'C$',
  'S$',
  'USD',
  'BRL',
  'EUR',
  'GBP',
  'JPY',
  'INR',
  'CAD',
  'AUD',
  'CHF',
  '$',
  '€',
  '£',
  '¥',
  '₹',
] as const;
const notations = new Map<string, NumberNotation>();
function notation(locale: string): NumberNotation {
  const cached = notations.get(locale);
  if (cached) return cached;
  const format = new Intl.NumberFormat(locale);
  const parts = format.formatToParts(123456789.12);
  const groups = parts.filter((part) => part.type === 'integer');
  const normalize = (text: string) => text.normalize('NFKC').replace(/\s/g, ' ');
  const result = {
    decimal: normalize(parts.find((part) => part.type === 'decimal')?.value ?? '.'),
    group: normalize(parts.find((part) => part.type === 'group')?.value ?? ','),
    primary: groups.at(-1)?.value.length ?? 3,
    secondary: groups.length > 1 ? groups.at(-2)!.value.length : (groups.at(-1)?.value.length ?? 3),
    digits: Array.from({ length: 10 }, (_, index): [string, string] => [
      normalize(new Intl.NumberFormat(locale, { useGrouping: false }).format(index)),
      String(index),
    ]),
  };
  if (notations.size >= 64) notations.delete(notations.keys().next().value!);
  notations.set(locale, result);
  return result;
}
/** Parse one observed number using the declared locale, without guessing separators. */
export function parseLocalizedNumber(input: string, locale: string): number | null {
  const { decimal, group, primary, secondary, digits } = notation(locale);
  let text = input
    .normalize('NFKC')
    .replace(/[\u200e\u200f\u061c]/g, '')
    .replace(/\s/g, ' ')
    .replace(/\u2212/g, '-');
  for (const [local, ascii] of digits) if (local !== ascii) text = text.split(local).join(ascii);
  // Accounting notation is deliberately unsupported rather than losing the sign.
  if (/\([^)]*\d[^)]*\)/.test(text)) return null;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const characters = [...new Set(['.', ',', decimal, group])].map(escape).join('');
  text = text.trim();
  const prefix = CURRENCY_MARKERS.find((marker) => text.startsWith(marker));
  const suffix = CURRENCY_MARKERS.find((marker) => text.endsWith(marker));
  if (prefix && suffix) return null;
  if (prefix) text = text.slice(prefix.length).trim();
  else if (suffix) text = text.slice(0, -suffix.length).trim();
  else if (text.endsWith('%')) text = text.slice(0, -1).trim();
  const pattern = new RegExp('^[+-]?\\d[\\d' + characters + ']*$', 'u');
  if (!pattern.test(text)) return null;
  const token = text;
  const pieces = token.replace(/^[+-]/, '').split(decimal);
  if (pieces.length > 2) return null;
  const integer = pieces[0]!;
  if (integer.includes(group)) {
    const segments = integer.split(group);
    if (
      !new RegExp('^\\d{1,' + secondary + '}$').test(segments[0]!) ||
      !new RegExp('^\\d{' + primary + '}$').test(segments.at(-1)!)
    )
      return null;
    if (
      segments.slice(1, -1).some((segment) => !new RegExp('^\\d{' + secondary + '}$').test(segment))
    )
      return null;
  } else if (!/^\d+$/.test(integer)) return null;
  if (pieces[1] !== undefined && !/^\d+$/.test(pieces[1])) return null;
  const normalized = token.split(group).join('').replace(decimal, '.');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
