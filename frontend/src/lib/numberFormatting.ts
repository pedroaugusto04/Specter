export function isMonetaryField(label: string): boolean {
  return /price|preço|preco|valor|cost|amount|salary|salário|salario/i.test(label);
}

/** Format a numeric observation using its declared locale and field meaning. */
export function formatObservedNumber(value: unknown, locale = 'pt-BR', label = ''): unknown {
  let number: number;
  if (typeof value === 'number') number = value;
  else if (typeof value === 'string') {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.';
    const group = parts.find((part) => part.type === 'group')?.value ?? ',';
    const raw = value.trim().replace(/\s/g, '').replace(/\u00a0/g, '');
    const escapedGroup = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedDecimal = decimal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`^[+-]?(?:\\d{1,3}(?:${escapedGroup}\\d{3})*|\\d+)(?:${escapedDecimal}\\d*|${escapedDecimal})?$`).test(raw)) return value;
    number = Number(raw.split(group).join('').replace(decimal, '.').replace(/\.$/, ''));
  } else return value;
  if (!Number.isFinite(number)) return value;
  const monetary = isMonetaryField(label);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: monetary ? 2 : 0,
    maximumFractionDigits: monetary ? 2 : 20,
  }).format(number);
}
