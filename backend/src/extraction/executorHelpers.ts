import { ExtractionMode, ExtractionQuality, FailureCode } from './constants.js';
import { UpstreamHttpError } from '../errors/domainErrors.js';
import type {
  DiscoveryAction,
  DocumentSession,
  DocumentSnapshot,
  ExecutionContext,
  ExecutionPolicy,
  ExtractionPlan,
  PageExtraction,
  Scalar,
} from './contracts.js';
import type { ExtractionReport } from '../types/extractionPlan.js';
import type { ExtractedPayload } from '../types/extractor.js';
import { discoverWithCapabilities } from './capabilities.js';
import { waitForPoll } from './context.js';
import { recordIdentity, compareIdentityText } from './values.js';
import type { IPageExtractor } from './pageExtractor.js';

export function createInitialReport(scope: ExtractionPlan['intent']['scope']): ExtractionReport {
  return {
    quality: ExtractionQuality.Inconclusive,
    scope,
    pagesVisited: 0,
    issues: [],
    sourcesUsed: {},
    evidence: [],
    trace: [],
    integrity: 'VALID',
    coverage: 'UNKNOWN',
  };
}

export function buildExtractedPayload(
  records: Map<string, Record<string, Scalar>>,
  mode: ExtractionMode,
  identityFields: string[]
): ExtractedPayload {
  if (mode === ExtractionMode.Single) {
    return [...records.values()][0] ?? {};
  }
  return {
    items: [...records.values()].sort((a, b) =>
      compareIdentityText(
        recordIdentity(a, identityFields),
        recordIdentity(b, identityFields)
      )
    ),
    count: records.size,
  };
}

export async function executeSetupActions(
  session: DocumentSession,
  setupActions: DiscoveryAction[] | undefined,
  context: ExecutionContext,
  currentActions: number,
  maxActions: number
): Promise<number> {
  let actions = currentActions;
  for (const action of setupActions ?? []) {
    context.check();
    if (actions >= maxActions) throw new Error('Setup action limit reached.');
    actions++;
    await discoverWithCapabilities(session, action);
  }
  return actions;
}

export async function observeDocumentExtraction(params: {
  session: DocumentSession;
  plan: ExtractionPlan;
  extractor: IPageExtractor;
  origin: string;
  context: ExecutionContext;
}): Promise<{ snapshot: DocumentSnapshot; page: PageExtraction }> {
  const { session, plan, extractor, origin, context } = params;
  context.check();

  const observed = new Map<string, boolean>();
  const conditions = [
    ...plan.strategy.ready,
    ...plan.strategy.empty,
    ...(plan.strategy.pagination?.end ?? []),
  ];

  for (const condition of conditions) {
    const value = await session.check(condition);
    if (value !== undefined) observed.set(JSON.stringify(condition), value);
  }

  // Capture after live checks so terminal evidence cannot precede the final records.
  const snapshot = await session.snapshot();
  if (snapshot.httpStatus >= 400) {
    throw new UpstreamHttpError(snapshot.httpStatus, snapshot.retryAfterMs);
  }
  if (new URL(snapshot.url).origin !== origin) {
    throw new Error('Navigation escaped the original origin.');
  }

  const page = extractor.extract(snapshot, plan, observed);
  return { snapshot, page };
}

export async function pollDocumentExtraction(params: {
  session: DocumentSession;
  plan: ExtractionPlan;
  extractor: IPageExtractor;
  origin: string;
  context: ExecutionContext;
  policy: ExecutionPolicy;
  predicate: (page: PageExtraction) => boolean;
  timeoutMs: number;
}): Promise<{ snapshot: DocumentSnapshot; page: PageExtraction }> {
  const { session, plan, extractor, origin, context, policy, predicate, timeoutMs } = params;
  const deadline = Math.min(context.deadline, Date.now() + timeoutMs);

  let current = await observeDocumentExtraction({ session, plan, extractor, origin, context });
  while (!predicate(current.page) && Date.now() < deadline) {
    await waitForPoll(context, policy);
    current = await observeDocumentExtraction({ session, plan, extractor, origin, context });
  }
  return current;
}

export interface RecordAccumulationResult {
  conflict: boolean;
  limitReached: boolean;
}

export function accumulatePageRecords(
  records: Map<string, Record<string, Scalar>>,
  pageRecords: Record<string, Scalar>[],
  identityFields: string[],
  maxItems: number
): RecordAccumulationResult {
  for (const record of pageRecords) {
    const key = recordIdentity(record, identityFields);
    if (records.has(key) && JSON.stringify(records.get(key)) !== JSON.stringify(record)) {
      return { conflict: true, limitReached: false };
    }
    if (!records.has(key) && records.size >= maxItems) {
      return { conflict: false, limitReached: true };
    }
    records.set(key, record);
  }
  return { conflict: false, limitReached: false };
}

export async function captureOptionalScreenshot(
  session: DocumentSession,
  snapshot: DocumentSnapshot,
  issues: string[]
): Promise<void> {
  try {
    snapshot.screenshot = await session.screenshot();
    if (!snapshot.screenshot) {
      issues.push('Optional screenshot unavailable for this transport.');
    }
  } catch {
    issues.push('Optional screenshot unavailable.');
  }
}
