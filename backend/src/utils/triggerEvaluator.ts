import { recordIdentity } from './planExtraction.js';
import type { TriggerRule } from '../types/extractionPlan.js';
import type { ExtractedPayload, ExtractedRecord } from '../types/extractor.js';
import { TriggerMatchMode, TriggerOperator } from '../types/enums.js';

export interface TriggerEvaluationResult {
  triggered: boolean;
  hasRules: boolean;
  matchedRules: TriggerRule[];
  reasons: string[];
}

/**
 * Extracts a numeric value from numbers or formatted currency/percentage strings.
 * Examples:
 *   - "$ 1,299.99" -> 1299.99
 *   - "R$ 3.500,00" -> 3500.00
 *   - "150 €" -> 150.00
 *   - "12.5%" -> 12.5
 */
export function parseNumericValue(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }

  if (typeof val !== 'string') {
    return null;
  }

  const trimmed = val.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;

  // Keep only digits, dots, commas, minus signs
  const cleaned = trimmed.replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;

  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // European / Brazilian format: 1.234,56 -> 1234.56
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // US / UK format: 1,234.56 -> 1234.56
    normalized = cleaned.replace(/,/g, '');
  }

  const parsed = parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Normalizes boolean strings or values.
 */
export function parseBooleanValue(val: unknown): boolean | null {
  if (typeof val === 'boolean') {
    return val;
  }

  if (typeof val !== 'string') {
    return null;
  }

  const lower = val.trim().toLowerCase();
  const truthy = [
    'true',
    '1',
    'yes',
    'sim',
    'in stock',
    'disponível',
    'available',
    'ativo',
    'active',
    'in_stock',
  ];
  const falsy = [
    'false',
    '0',
    'no',
    'não',
    'out of stock',
    'esgotado',
    'indisponível',
    'unavailable',
    'inativo',
    'out_of_stock',
  ];

  if (truthy.includes(lower)) return true;
  if (falsy.includes(lower)) return false;

  return null;
}

/**
 * Evaluates a single rule against a concrete value extracted from the page.
 * Optionally accepts previousValue to evaluate relative changes (e.g. percentage drops or decreases).
 */
export function evaluateSingleRule(
  actualValue: unknown,
  rule: TriggerRule,
  previousValue?: unknown
): { satisfied: boolean; reason: string } {
  const { field, operator, value: targetValue } = rule;
  if (actualValue === null || actualValue === undefined)
    return { satisfied: false, reason: `Field '${field}' is unavailable.` };

  // 1. Numeric comparisons: lt, lte, gt, gte
  if (
    (
      [
        TriggerOperator.LessThan,
        TriggerOperator.LessThanOrEqual,
        TriggerOperator.GreaterThan,
        TriggerOperator.GreaterThanOrEqual,
      ] as TriggerOperator[]
    ).includes(operator)
  ) {
    const actualNum = parseNumericValue(actualValue);
    const targetNum = parseNumericValue(targetValue);

    if (actualNum === null || targetNum === null) {
      return {
        satisfied: false,
        reason: `Field '${field}' value (${String(actualValue)}) could not be parsed as a number for comparison with ${String(targetValue)}.`,
      };
    }

    let satisfied = false;
    let opSymbol = '';
    switch (operator) {
      case TriggerOperator.LessThan:
        satisfied = actualNum < targetNum;
        opSymbol = '<';
        break;
      case TriggerOperator.LessThanOrEqual:
        satisfied = actualNum <= targetNum;
        opSymbol = '<=';
        break;
      case TriggerOperator.GreaterThan:
        satisfied = actualNum > targetNum;
        opSymbol = '>';
        break;
      case TriggerOperator.GreaterThanOrEqual:
        satisfied = actualNum >= targetNum;
        opSymbol = '>=';
        break;
    }

    return {
      satisfied,
      reason: satisfied
        ? `${field} (${actualNum}) ${opSymbol} ${targetNum}`
        : `${field} (${actualNum}) is not ${opSymbol} ${targetNum}`,
    };
  }

  // 2. Relative percentage changes: percentage_drop, percentage_increase
  if (
    operator === TriggerOperator.PercentageDrop ||
    operator === TriggerOperator.PercentageIncrease
  ) {
    const actualNum = parseNumericValue(actualValue);
    const prevNum = parseNumericValue(previousValue);
    const targetPct = parseNumericValue(targetValue);

    if (actualNum === null || prevNum === null || targetPct === null || prevNum <= 0) {
      return {
        satisfied: false,
        reason: `Field '${field}' requires a previous positive numeric value (${String(previousValue)}), current value (${String(actualValue)}), and percentage target (${String(targetValue)}).`,
      };
    }

    if (operator === TriggerOperator.PercentageDrop) {
      if (actualNum >= prevNum) {
        return {
          satisfied: false,
          reason: `${field} did not drop (was ${prevNum}, now ${actualNum}).`,
        };
      }
      const dropPct = ((prevNum - actualNum) / prevNum) * 100;
      const satisfied = dropPct >= targetPct;
      return {
        satisfied,
        reason: satisfied
          ? `${field} dropped by ${dropPct.toFixed(1)}% (from ${prevNum} to ${actualNum}) >= ${targetPct}%`
          : `${field} dropped by ${dropPct.toFixed(1)}%, which is below target ${targetPct}%`,
      };
    } else {
      if (actualNum <= prevNum) {
        return {
          satisfied: false,
          reason: `${field} did not increase (was ${prevNum}, now ${actualNum}).`,
        };
      }
      const incPct = ((actualNum - prevNum) / prevNum) * 100;
      const satisfied = incPct >= targetPct;
      return {
        satisfied,
        reason: satisfied
          ? `${field} increased by ${incPct.toFixed(1)}% (from ${prevNum} to ${actualNum}) >= ${targetPct}%`
          : `${field} increased by ${incPct.toFixed(1)}%, which is below target ${targetPct}%`,
      };
    }
  }

  // 3. Simple relative changes: decreased, increased
  if (operator === TriggerOperator.Decreased || operator === TriggerOperator.Increased) {
    const actualNum = parseNumericValue(actualValue);
    const prevNum = parseNumericValue(previousValue);

    if (actualNum === null || prevNum === null) {
      return {
        satisfied: false,
        reason: `Field '${field}' requires a prior numeric value (${String(previousValue)}) and current value (${String(actualValue)}) for comparison.`,
      };
    }

    if (operator === TriggerOperator.Decreased) {
      const satisfied = actualNum < prevNum;
      return {
        satisfied,
        reason: satisfied
          ? `${field} decreased from ${prevNum} to ${actualNum}`
          : `${field} did not decrease (was ${prevNum}, now ${actualNum})`,
      };
    } else {
      const satisfied = actualNum > prevNum;
      return {
        satisfied,
        reason: satisfied
          ? `${field} increased from ${prevNum} to ${actualNum}`
          : `${field} did not increase (was ${prevNum}, now ${actualNum})`,
      };
    }
  }

  // 4. Any value or text change relative to previous: changes
  if (operator === TriggerOperator.Changes) {
    if (previousValue === undefined || previousValue === null) {
      return {
        satisfied: false,
        reason: `No previous value recorded for '${field}' to detect a change.`,
      };
    }

    const actualNum = typeof actualValue === 'number' ? actualValue : null;
    const prevNum = typeof previousValue === 'number' ? previousValue : null;
    if (actualNum !== null && prevNum !== null) {
      const satisfied = actualNum !== prevNum;
      return {
        satisfied,
        reason: satisfied
          ? `${field} changed from ${prevNum} to ${actualNum}`
          : `${field} remained unchanged at ${actualNum}`,
      };
    }

    const actualStr = String(actualValue ?? '').trim();
    const prevStr = String(previousValue ?? '').trim();
    const satisfied = actualStr.toLowerCase() !== prevStr.toLowerCase();
    return {
      satisfied,
      reason: satisfied
        ? `${field} changed from "${prevStr}" to "${actualStr}"`
        : `${field} remained unchanged ("${actualStr}")`,
    };
  }

  // 5. Equality comparisons: eq, neq
  if (operator === TriggerOperator.Equal || operator === TriggerOperator.NotEqual) {
    // Do not interpret identifiers or arbitrary text as numeric values.
    const actualNum = typeof actualValue === 'number' ? actualValue : null;
    const targetNum = typeof targetValue === 'number' ? targetValue : null;
    if (actualNum !== null && targetNum !== null) {
      const isEq = actualNum === targetNum;
      const satisfied = operator === TriggerOperator.Equal ? isEq : !isEq;
      const symbol = operator === TriggerOperator.Equal ? '==' : '!=';
      return {
        satisfied,
        reason: `${field} (${actualNum}) ${symbol} ${targetNum}`,
      };
    }

    // Try boolean equality
    const actualBool = parseBooleanValue(actualValue);
    const targetBool = parseBooleanValue(targetValue);
    if (actualBool !== null && targetBool !== null) {
      const isEq = actualBool === targetBool;
      const satisfied = operator === TriggerOperator.Equal ? isEq : !isEq;
      const symbol = operator === TriggerOperator.Equal ? '==' : '!=';
      return {
        satisfied,
        reason: `${field} (${actualBool}) ${symbol} ${targetBool}`,
      };
    }

    // Fallback to case-insensitive string equality
    const actualStr = String(actualValue ?? '')
      .trim()
      .toLowerCase();
    const targetStr = String(targetValue ?? '')
      .trim()
      .toLowerCase();
    const isEq = actualStr === targetStr;
    const satisfied = operator === TriggerOperator.Equal ? isEq : !isEq;
    const symbol = operator === TriggerOperator.Equal ? '==' : '!=';

    return {
      satisfied,
      reason: `${field} ("${String(actualValue ?? '')}") ${symbol} "${String(targetValue)}"`,
    };
  }

  // 6. Substring checks: contains, not_contains
  if (operator === TriggerOperator.Contains || operator === TriggerOperator.NotContains) {
    const actualStr = String(actualValue ?? '').toLowerCase();
    const targetStr = String(targetValue ?? '').toLowerCase();
    const contains = actualStr.includes(targetStr);
    const satisfied = operator === TriggerOperator.Contains ? contains : !contains;

    return {
      satisfied,
      reason: satisfied
        ? `${field} ${operator === TriggerOperator.Contains ? TriggerOperator.Contains : 'does not contain'} "${String(targetValue)}"`
        : `${field} does not satisfy ${operator} "${String(targetValue)}"`,
    };
  }

  return { satisfied: false, reason: `Unknown trigger operator '${operator}'.` };
}

/** Evaluate conditions within each changed entity, aligned by stable identity. */
export function evaluateTriggerRules(
  payload: ExtractedPayload | null,
  rules?: TriggerRule[],
  matchMode: TriggerMatchMode = TriggerMatchMode.All,
  previousPayload?: ExtractedPayload | null,
  identityFields: string[] = []
): TriggerEvaluationResult {
  if (!rules?.length) return { triggered: true, hasRules: false, matchedRules: [], reasons: [] };
  if (!payload)
    return { triggered: false, hasRules: true, matchedRules: [], reasons: ['No data available.'] };
  const records =
    'items' in payload && Array.isArray(payload.items)
      ? payload.items
      : [payload as ExtractedRecord];
  const previous =
    previousPayload && 'items' in previousPayload && Array.isArray(previousPayload.items)
      ? previousPayload.items
      : previousPayload
        ? [previousPayload as ExtractedRecord]
        : [];
  const collection = 'items' in payload && Array.isArray(payload.items);
  if (collection && !identityFields.length)
    return {
      triggered: false,
      hasRules: true,
      matchedRules: [],
      reasons: ['Collection identity is required.'],
    };
  for (const record of records) {
    const old = collection
      ? previous.find(
          (item) => recordIdentity(item, identityFields) === recordIdentity(record, identityFields)
        )
      : previous[0];
    if (old && JSON.stringify(old) === JSON.stringify(record)) continue;
    const results = rules.map((rule) => ({
      rule,
      result: evaluateSingleRule(record[rule.field], rule, old?.[rule.field]),
    }));
    const matched = results.filter((entry) => entry.result.satisfied);
    if (matchMode === TriggerMatchMode.All ? matched.length === rules.length : matched.length > 0)
      return {
        triggered: true,
        hasRules: true,
        matchedRules: matched.map((entry) => entry.rule),
        reasons: matched.map((entry) => entry.result.reason),
      };
  }
  return {
    triggered: false,
    hasRules: true,
    matchedRules: [],
    reasons: ['No changed entity satisfied the conditions.'],
  };
}
