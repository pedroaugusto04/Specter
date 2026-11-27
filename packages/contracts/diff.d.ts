import type { EntityChange } from './extraction.js';
import type { EntityChangeKind } from './vocabulary.js';

export interface DiffChangeEntry {
  field: string;
  changeType: EntityChangeKind;
  previousValue: unknown;
  currentValue: unknown;
}

export interface DiffSummary {
  entityChanges?: EntityChange[];
  hasChanges: boolean;
  totalChanges: number;
  added: DiffChangeEntry[];
  modified: DiffChangeEntry[];
  removed: DiffChangeEntry[];
  summaryText: string;
}
