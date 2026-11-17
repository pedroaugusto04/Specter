import type { JobRunDto } from '@/lib/api';

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function runsToCsv(runs: JobRunDto[]): string {
  if (!runs || runs.length === 0) return '';

  const dataFieldKeys = new Set<string>();
  for (const r of runs) {
    if (r.extractedData && typeof r.extractedData === 'object' && !Array.isArray(r.extractedData)) {
      if ('items' in r.extractedData && Array.isArray((r.extractedData as Record<string, unknown>).items)) {
        const items = (r.extractedData as Record<string, unknown>).items as unknown[];
        for (const item of items) {
          if (typeof item === 'object' && item !== null) {
            Object.keys(item).forEach((k) => dataFieldKeys.add(k));
          }
        }
      } else {
        Object.keys(r.extractedData).forEach((k) => dataFieldKeys.add(k));
      }
    }
  }

  const standardHeaders = ['Run ID', 'Executed At', 'Status', 'HTTP Status', 'Duration (ms)', 'Has Changes'];
  const dataHeaders = Array.from(dataFieldKeys);
  const allHeaders = [...standardHeaders, ...dataHeaders];

  const rows: string[] = [];
  rows.push(allHeaders.map(escapeCsvField).join(','));

  for (const r of runs) {
    const baseCols = [
      r.id,
      r.executedAt,
      r.status,
      r.httpStatus ?? '',
      r.durationMs ?? '',
      r.hasChanges ?? '',
    ];

    if (r.extractedData && typeof r.extractedData === 'object') {
      if ('items' in r.extractedData && Array.isArray((r.extractedData as Record<string, unknown>).items)) {
        const items = (r.extractedData as Record<string, unknown>).items as unknown[];
        if (items.length === 0) {
          const dataCols = dataHeaders.map(() => '');
          rows.push([...baseCols, ...dataCols].map(escapeCsvField).join(','));
        } else {
          for (const item of items) {
            const itemRecord = (item as Record<string, unknown>) ?? {};
            const dataCols = dataHeaders.map((k) => itemRecord[k] ?? '');
            rows.push([...baseCols, ...dataCols].map(escapeCsvField).join(','));
          }
        }
      } else {
        const record = r.extractedData as Record<string, unknown>;
        const dataCols = dataHeaders.map((k) => record[k] ?? '');
        rows.push([...baseCols, ...dataCols].map(escapeCsvField).join(','));
      }
    } else {
      const dataCols = dataHeaders.map(() => '');
      rows.push([...baseCols, ...dataCols].map(escapeCsvField).join(','));
    }
  }

  // Prepend UTF-8 BOM so Excel opens accents / symbols properly
  return '\uFEFF' + rows.join('\r\n');
}

export function runsToJson(runs: JobRunDto[]): string {
  const formatted = runs.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    executedAt: r.executedAt,
    status: r.status,
    httpStatus: r.httpStatus,
    durationMs: r.durationMs,
    hasChanges: r.hasChanges,
    errorMessage: r.errorMessage,
    screenshotUrl: r.screenshotUrl,
    extractedData: r.extractedData,
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
