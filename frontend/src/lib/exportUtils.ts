import { isCollectionPayload, type ExtractedRecord } from '@specter/contracts';
import type { JobRunDto } from '@/lib/api';

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function runRecords(run: JobRunDto): ExtractedRecord[] {
  if (!run.extractedData) return [];
  if (isCollectionPayload(run.extractedData)) return run.extractedData.items;
  return [run.extractedData];
}

export function runsToCsv(runs: JobRunDto[]): string {
  if (runs.length === 0) return '';

  const dataFieldKeys = new Set<string>();
  for (const run of runs) {
    for (const record of runRecords(run)) {
      for (const key of Object.keys(record)) {
        dataFieldKeys.add(key);
      }
    }
  }

  const standardHeaders = [
    'Run ID',
    'Executed At',
    'Status',
    'HTTP Status',
    'Duration (ms)',
    'Has Changes',
  ];
  const dataHeaders = Array.from(dataFieldKeys);
  const rows: string[] = [[...standardHeaders, ...dataHeaders].map(escapeCsvField).join(',')];

  for (const run of runs) {
    const baseCols = [
      run.id,
      run.executedAt,
      run.status,
      run.httpStatus ?? '',
      run.durationMs ?? '',
      run.hasChanges,
    ];
    const records = runRecords(run);

    if (records.length === 0) {
      const emptyCols = dataHeaders.map(() => '');
      rows.push([...baseCols, ...emptyCols].map(escapeCsvField).join(','));
      continue;
    }

    for (const record of records) {
      const dataCols = dataHeaders.map((key) => record[key] ?? '');
      rows.push([...baseCols, ...dataCols].map(escapeCsvField).join(','));
    }
  }

  // Prepend UTF-8 BOM so Excel opens accents / symbols properly
  return '\uFEFF' + rows.join('\r\n');
}

export function runsToJson(runs: JobRunDto[]): string {
  const formatted = runs.map((run) => ({
    id: run.id,
    jobId: run.jobId,
    executedAt: run.executedAt,
    status: run.status,
    httpStatus: run.httpStatus,
    durationMs: run.durationMs,
    hasChanges: run.hasChanges,
    errorMessage: run.errorMessage,
    screenshotUrl: run.screenshotUrl,
    extractedData: run.extractedData,
  }));
  return JSON.stringify(formatted, null, 2);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
