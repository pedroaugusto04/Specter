import { finiteNumber as numericValue, sameRecord } from '@specter/contracts';
import { payloadRecords } from '../extraction/comparison.js';
import { recordIdentity } from '../extraction/values.js';
import type { TriggerRule } from '../types/extractionPlan.js';
import type { ExtractedPayload } from '../types/extractor.js';
import { TriggerMatchMode, TriggerOperator } from '../types/enums.js';

export interface TriggerEvaluationResult {
  triggered: boolean;
  hasRules: boolean;
  matchedRules: TriggerRule[];
  reasons: string[];
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
    const actualNum = numericValue(actualValue);
    const targetNum = numericValue(targetValue);

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
    const actualNum = numericValue(actualValue);
    const prevNum = numericValue(previousValue);
    const targetPct = numericValue(targetValue);

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
    const actualNum = numericValue(actualValue);
    const prevNum = numericValue(previousValue);

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

    const satisfied = actualValue !== previousValue;
    return { satisfied, reason: satisfied ? `${field} changed.` : `${field} remained unchanged.` };
  }

  if (operator === TriggerOperator.Equal || operator === TriggerOperator.NotEqual) {
    if (
      typeof actualValue !== typeof targetValue ||
      (typeof actualValue === 'number' &&
        (numericValue(actualValue) === null || numericValue(targetValue) === null))
    ) {
      return { satisfied: false, reason: `Field '${field}' has incompatible comparison types.` };
    }
    const equal =
      typeof actualValue === 'string' && typeof targetValue === 'string'
        ? actualValue.toLowerCase() === targetValue.toLowerCase()
        : actualValue === targetValue;
    return {
      satisfied: operator === TriggerOperator.Equal ? equal : !equal,
      reason: `${field} compared with ${String(targetValue)}.`,
    };
  }

  // 6. Substring checks: contains, not_contains
  if (operator === TriggerOperator.Contains || operator === TriggerOperator.NotContains) {
    if (typeof actualValue !== 'string' || typeof targetValue !== 'string')
      return { satisfied: false, reason: `Field '${field}' requires text values.` };
    const actualStr = actualValue.toLowerCase();
    const targetStr = targetValue.toLowerCase();
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
  const records = payloadRecords(payload);
  const previous = previousPayload ? payloadRecords(previousPayload) : [];
  const previousByIdentity = new Map(
    previous.map((record) => [recordIdentity(record, identityFields), record])
  );
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
      ? previousByIdentity.get(recordIdentity(record, identityFields))
      : previous[0];
    if (old && sameRecord(old, record)) continue;
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
