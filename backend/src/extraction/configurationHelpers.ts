import * as cheerio from 'cheerio';
import type { DocumentSnapshot, ExtractionPlan } from './contracts.js';
import type { ExecutionResult } from './executor.js';
import { redactObject, redactText } from './evidence.js';
import { observationPacket } from './configurationTools.js';
import { ConfigurationToolKind } from './configurationConstants.js';

export function isToolHistoryEntry(h: unknown): boolean {
  return Boolean(h && typeof h === 'object' && 'tool' in h);
}

export function countToolHistory(history: unknown[]): number {
  return history.filter(isToolHistoryEntry).length;
}

export function buildObservationEvidence(params: {
  snapshot: DocumentSnapshot;
  history: unknown[];
  feedback: string;
  availableLimit: number;
}): string {
  const { snapshot, history, feedback, availableLimit } = params;
  const toolCount = countToolHistory(history);

  const observationBudget = history.length
    ? Math.max(1000, Math.floor(availableLimit * 0.65))
    : availableLimit;

  let activeFeedback = feedback;
  if (!feedback && toolCount >= 3) {
    const remaining = Math.max(0, 5 - toolCount);
    activeFeedback = `Observation budget notice: You have used ${toolCount} of 5 tool observations. ${remaining} remain. Return kind 'candidate' when the evidence supports the plan. If an important uncertainty remains and observations are available, use a tool to investigate it.`;
  }

  return JSON.stringify({
    feedback: redactText(activeFeedback),
    observation: observationPacket(snapshot, observationBudget),
    history: redactObject([...history].reverse()),
  });
}

export function precheckCandidatePlanInSnapshot(
  plan: ExtractionPlan,
  snapshot: DocumentSnapshot | undefined
): { valid: boolean; rejection?: string } {
  const hasSetup = (plan.strategy.setup?.length ?? 0) > 0;
  if (!hasSetup && plan.strategy.records.kind === 'dom' && snapshot?.html) {
    const $ = cheerio.load(snapshot.html);
    const records = $(plan.strategy.records.selector);
    const recordCount = records.length;
    if (recordCount === 0) {
      return {
        valid: false,
        rejection: `Candidate record selector '${plan.strategy.records.selector}' matched 0 elements in observed DOM. Select an existing container.`,
      };
    }
    const firstRecord = records.first();
    for (const [name, sources] of Object.entries(plan.strategy.fields)) {
      for (const source of sources) {
        if (source.kind === 'dom' && source.selector !== ':scope') {
          let targets;
          try {
            targets = firstRecord.find(source.selector);
            if (
              targets.length === 0 &&
              (source.selector.startsWith('meta') || source.selector.startsWith('head'))
            ) {
              const root = firstRecord.parents().length ? firstRecord.parents().last() : firstRecord;
              targets = root.find(source.selector);
            }
          } catch {
            return {
              valid: false,
              rejection: `Field '${name}' has invalid CSS selector '${source.selector}'. Provide a valid CSS selector.`,
            };
          }
          if (targets.length > 1) {
            const distinctValues = new Set<string>();
            targets.each((_, el) => {
              const text = (
                source.attribute === 'text' ? $(el).text() : $(el).attr(source.attribute)
              )?.trim();
              if (text) distinctValues.add(text);
            });
            if (distinctValues.size > 1) {
              if (source.pattern) {
                try {
                  const regex = new RegExp(source.pattern, 'u');
                  const patternMatches = new Set<string>();
                  targets.each((_, el) => {
                    const text = (
                      source.attribute === 'text' ? $(el).text() : $(el).attr(source.attribute)
                    )?.trim();
                    if (text) {
                      const m = text.match(regex);
                      if (m) patternMatches.add(m[1] !== undefined ? m[1] : m[0]);
                    }
                  });
                  if (patternMatches.size === 1) {
                    continue;
                  }
                } catch {
                  // invalid regex falls through to ambiguity rejection
                }
              }
              const samples = Array.from(distinctValues)
                .slice(0, 3)
                .map((v) => JSON.stringify(v.length > 40 ? v.slice(0, 37) + '...' : v))
                .join(', ');
              return {
                valid: false,
                rejection: `Ambiguous DOM field source: field '${name}' selector '${source.selector}' matched ${targets.length} elements with ${distinctValues.size} distinct values in record (${samples}). Narrow the selector or provide a pattern to isolate a single value.`,
              };
            }
          }
        }
      }
    }
  }
  return { valid: true };
}

export function buildValidationHistoryEntry(
  decisionIndex: number,
  plan: ExtractionPlan,
  execution: ExecutionResult
): Record<string, unknown> {
  return {
    id: decisionIndex,
    validation: redactObject({
      records: plan.strategy.records,
      identityFields: plan.intent.identityFields,
      quality: execution.report.quality,
      issues: execution.report.issues.slice(0, 8),
      sourcesUsed: execution.report.sourcesUsed,
      evidence: execution.report.evidence?.slice(0, 8),
    }),
  };
}

export function isScopedOrInteractiveTool(toolKind: string): boolean {
  return (
    toolKind === ConfigurationToolKind.Inspect ||
    toolKind === ConfigurationToolKind.Interact
  );
}
