import { SourceKind } from './constants.js';
import * as cheerio from 'cheerio';
import type { Condition, DocumentSnapshot, NetworkResponse, Scalar } from './contracts.js';

export function readPath(value: unknown, path: Array<string | number>): unknown {
  return path.reduce<unknown>((current, key) => {
    if (['__proto__', 'constructor', 'prototype'].includes(String(key))) return undefined;
    return current && typeof current === 'object' && Object.hasOwn(current, key)
      ? (current as Record<string, unknown>)[key]
      : undefined;
  }, value);
}

export function matchingResponses(
  snapshot: DocumentSnapshot,
  match: { urlPattern: string; method?: string }
): NetworkResponse[] {
  // Literal URL fragments, never executable/generated regex patterns.
  return snapshot.responses.filter(
    (response) =>
      response.status >= 200 &&
      response.status < 300 &&
      response.url.includes(match.urlPattern) &&
      (!match.method || response.method === match.method.toUpperCase())
  );
}

export function evaluateCondition(
  condition: Condition,
  snapshot: DocumentSnapshot,
  records: Record<string, Scalar>[],
  observed?: Map<string, boolean>
): boolean {
  const browserResult = observed?.get(JSON.stringify(condition));
  if (browserResult !== undefined) return browserResult;
  if (condition.kind === 'field')
    return (
      records.length > 0 &&
      records.every(
        (record) => record[condition.field] !== null && record[condition.field] !== undefined
      )
    );
  if (condition.kind === SourceKind.Response)
    return matchingResponses(snapshot, condition.match).some((response) => {
      const value = condition.path ? readPath(response.body, condition.path) : response.body;
      return condition.equals === undefined
        ? value !== undefined && value !== null
        : value === condition.equals;
    });
  if (condition.kind === 'visible' || condition.locator.kind !== 'css') return false;
  const $ = cheerio.load(snapshot.html);
  const elements = $(condition.locator.selector);
  if (condition.kind === 'exists') return elements.length > 0;
  if (condition.kind === 'absent') return elements.length === 0;
  if (condition.kind === 'disabled')
    return (
      elements.length > 0 &&
      elements
        .toArray()
        .every(
          (element) =>
            $(element).attr('disabled') !== undefined || $(element).attr('aria-disabled') === 'true'
        )
    );
  if (condition.kind === 'attribute')
    return elements.toArray().some((element) => {
      const value = $(element).attr(condition.attribute);
      return condition.value === undefined ? Boolean(value?.trim()) : value === condition.value;
    });
  return false;
}
