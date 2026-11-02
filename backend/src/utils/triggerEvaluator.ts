import type { ExtractedPayload, ExtractedRecord, TriggerOperator, TriggerRule } from '../types/extractor.js';

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
  const truthy = ['true', '1', 'yes', 'sim', 'in stock', 'disponível', 'available', 'ativo', 'active', 'in_stock'];
  const falsy = ['false', '0', 'no', 'não', 'out of stock', 'esgotado', 'indisponível', 'unavailable', 'inativo', 'out_of_stock'];

  if (truthy.includes(lower)) return true;
  if (falsy.includes(lower)) return false;

  return null;
}

/**
 * Evaluates a single rule against a concrete value extracted from the page.
 */
export function evaluateSingleRule(
  actualValue: unknown,
  rule: TriggerRule
): { satisfied: boolean; reason: string } {
  const { field, operator, value: targetValue } = rule;

  // 1. Numeric comparisons: lt, lte, gt, gte
  if (['lt', 'lte', 'gt', 'gte'].includes(operator)) {
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
      case 'lt':
        satisfied = actualNum < targetNum;
        opSymbol = '<';
        break;
      case 'lte':
        satisfied = actualNum <= targetNum;
        opSymbol = '<=';
        break;
      case 'gt':
        satisfied = actualNum > targetNum;
        opSymbol = '>';
        break;
      case 'gte':
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

  // 2. Equality comparisons: eq, neq
  if (operator === 'eq' || operator === 'neq') {
    // Try numeric equality first if both represent numbers
    const actualNum = parseNumericValue(actualValue);
    const targetNum = parseNumericValue(targetValue);
    if (actualNum !== null && targetNum !== null) {
      const isEq = actualNum === targetNum;
      const satisfied = operator === 'eq' ? isEq : !isEq;
      const symbol = operator === 'eq' ? '==' : '!=';
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
      const satisfied = operator === 'eq' ? isEq : !isEq;
      const symbol = operator === 'eq' ? '==' : '!=';
      return {
        satisfied,
        reason: `${field} (${actualBool}) ${symbol} ${targetBool}`,
      };
    }

    // Fallback to case-insensitive string equality
    const actualStr = String(actualValue ?? '').trim().toLowerCase();
    const targetStr = String(targetValue ?? '').trim().toLowerCase();
    const isEq = actualStr === targetStr;
    const satisfied = operator === 'eq' ? isEq : !isEq;
    const symbol = operator === 'eq' ? '==' : '!=';

    return {
      satisfied,
      reason: `${field} ("${String(actualValue ?? '')}") ${symbol} "${String(targetValue)}"`,
    };
  }

  // 3. Substring checks: contains, not_contains
  if (operator === 'contains' || operator === 'not_contains') {
    const actualStr = String(actualValue ?? '').toLowerCase();
    const targetStr = String(targetValue ?? '').toLowerCase();
    const contains = actualStr.includes(targetStr);
    const satisfied = operator === 'contains' ? contains : !contains;

    return {
      satisfied,
      reason: satisfied
        ? `${field} ${operator === 'contains' ? 'contains' : 'does not contain'} "${String(targetValue)}"`
        : `${field} does not satisfy ${operator} "${String(targetValue)}"`,
    };
  }

  return { satisfied: false, reason: `Unknown trigger operator '${operator}'.` };
}

/**
 * Checks whether a single rule is satisfied across a single record or an array of records.
 */
function isRuleSatisfiedInPayload(
  payload: ExtractedPayload,
  rule: TriggerRule
): { satisfied: boolean; reason: string } {
  if ('items' in payload && Array.isArray(payload.items)) {
    for (const record of payload.items) {
      const actual = record[rule.field];
      const result = evaluateSingleRule(actual, rule);
      if (result.satisfied) {
        return result;
      }
    }
    return {
      satisfied: false,
      reason: `No item in list satisfied condition '${rule.field} ${rule.operator} ${rule.value}'.`,
    };
  }

  const record = payload as ExtractedRecord;
  const actual = record[rule.field];
  return evaluateSingleRule(actual, rule);
}

/**
 * Evaluates all trigger rules on the extracted payload.
 * If triggerRules is empty, returns triggered: true (standard change alert behavior).
 */
export function evaluateTriggerRules(
  payload: ExtractedPayload | null,
  rules?: TriggerRule[],
  matchMode: 'any' | 'all' = 'any'
): TriggerEvaluationResult {
  if (!rules || rules.length === 0) {
    return {
      triggered: true,
      hasRules: false,
      matchedRules: [],
      reasons: [],
    };
  }

  if (!payload) {
    return {
      triggered: false,
      hasRules: true,
      matchedRules: [],
      reasons: ['No extracted data available to evaluate trigger conditions.'],
    };
  }

  const matchedRules: TriggerRule[] = [];
  const reasons: string[] = [];
  let allSatisfied = true;

  for (const rule of rules) {
    const result = isRuleSatisfiedInPayload(payload, rule);
    if (result.satisfied) {
      matchedRules.push(rule);
      reasons.push(result.reason);
    } else {
      allSatisfied = false;
    }
  }

  const triggered = matchMode === 'all' ? allSatisfied : matchedRules.length > 0;

  return {
    triggered,
    hasRules: true,
    matchedRules,
    reasons: matchedRules.length > 0 ? reasons : ['Trigger conditions not met.'],
  };
}
