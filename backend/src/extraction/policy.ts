import { env } from '../config/env.js';
import type { ExecutionPolicy } from './contracts.js';

export function executionPolicy(): ExecutionPolicy {
  return {
    timeoutMs: env.EXTRACTION_TIMEOUT_MS,
    navigationTimeoutMs: env.PLAYWRIGHT_TIMEOUT_MS,
    actionTimeoutMs: env.EXTRACTION_ACTION_TIMEOUT_MS,
    pollIntervalMs: env.EXTRACTION_POLL_INTERVAL_MS,
    maxPages: env.EXTRACTION_MAX_PAGES,
    maxActions: env.EXTRACTION_MAX_ACTIONS,
    maxItems: env.EXTRACTION_MAX_ITEMS,
    maxEvidence: env.EXTRACTION_MAX_EVIDENCE,
  };
}
