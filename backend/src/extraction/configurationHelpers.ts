import * as cheerio from 'cheerio';
import { canonicalJson } from '../utils/diffHasher.js';
import type { DocumentSnapshot, ExtractionPlan } from './contracts.js';
import type { ExecutionResult } from './executor.js';
import { redactObject, redactText } from './evidence.js';
import { observationPacket } from './configurationTools.js';
import {
  ConfigurationToolKind,
  ConfigurationErrorCode,
} from './configurationConstants.js';
import type { ConfigurationTool } from './configurationSchemas.js';

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
    activeFeedback = `Decision budget notice: You have completed ${toolCount} tool observations and have sufficient structural evidence. Do not call additional tools. In this turn, you MUST emit kind 'candidate' with your best extraction plan derived from observed evidence.`;
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
    const recordCount = $(plan.strategy.records.selector).length;
    if (recordCount === 0) {
      return {
        valid: false,
        rejection: `Candidate record selector '${plan.strategy.records.selector}' matched 0 elements in observed DOM. Select an existing container.`,
      };
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
