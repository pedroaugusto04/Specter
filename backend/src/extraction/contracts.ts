export type * from '@specter/contracts/extraction';
import type {
  ExecutionStrategy,
  Condition,
  DocumentSnapshot,
  ExtractionPlan,
  DiscoveryAction,
} from '@specter/contracts/extraction';
export interface ExecutionPolicy {
  timeoutMs: number;
  navigationTimeoutMs: number;
  actionTimeoutMs: number;
  pollIntervalMs: number;
  maxPages: number;
  maxActions: number;
  maxItems: number;
  maxEvidence: number;
}

export interface ExecutionContext {
  readonly runId: string;
  readonly deadline: number;
  readonly signal: AbortSignal;
  remaining(): number;
  check(): void;
}

export interface DocumentCapabilities {
  readonly interactions: boolean;
  readonly networkResponses: boolean;
  readonly scopedDocuments: boolean;
}
export interface DocumentSession {
  readonly capabilities?: DocumentCapabilities;
  snapshot(): Promise<DocumentSnapshot>;
  check(condition: Condition): Promise<boolean | undefined>;
  advance(pagination: NonNullable<ExecutionStrategy['pagination']>): Promise<void>;
  discover(action: DiscoveryAction): Promise<DocumentSnapshot>;
  screenshot(): Promise<Uint8Array | undefined>;
  close(): Promise<void>;
}

export interface DocumentAdapter {
  open(
    url: string,
    plan: ExtractionPlan,
    context: ExecutionContext,
    options: { storageState?: unknown; captureScreenshot?: boolean }
  ): Promise<DocumentSession>;
}
