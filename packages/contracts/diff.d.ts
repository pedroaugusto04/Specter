export interface DiffChangeEntry {
  field: string;
  changeType: 'ADDED' | 'MODIFIED' | 'REMOVED';
  previousValue: unknown;
  currentValue: unknown;
}

export interface DiffSummary {
  entityChanges?: import('./extraction.js').EntityChange[];
  hasChanges: boolean;
  totalChanges: number;
  added: DiffChangeEntry[];
  modified: DiffChangeEntry[];
  removed: DiffChangeEntry[];
  summaryText: string;
  summaryHtml: string;
}
