'use client';
import type { JobRunDto } from '@/lib/api';
import { getExtractionFieldLabels } from '@/lib/extractionDisplay';
import type { ExtractionFieldDefinitions } from '@/lib/extractionDisplay';
export function ExtractionEvidence({
  report,
  fields = {},
}: {
  report: JobRunDto['extractionReport'];
  fields?: ExtractionFieldDefinitions;
}) {
  if (!report) return null;
  const fieldLabels = getExtractionFieldLabels(fields);
  const review = report.semanticReview;
  return (
    <div className="space-y-3 text-xs">
      {review && (
        <section className="rounded border border-border p-3">
          <p className="font-medium">
            AI review: {review.status}
            {review.score !== null ? ' | ' + review.score + '/10' : ''}
          </p>
          {review.reasons.map((reason, index) => (
            <p key={index} className="mt-1 text-muted-foreground">
              {reason}
            </p>
          ))}
        </section>
      )}
      {!!report.issues.length && <p className="text-amber-600">{report.issues.join(' ')}</p>}
      {!!report.evidence?.length && (
        <details className="rounded border border-border p-3">
          <summary className="cursor-pointer">
            Data sources and sample ({report.evidence.length} fields)
          </summary>
          <div className="mt-2 overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Source</th>
                  <th>Original</th>
                  <th>Extracted</th>
                </tr>
              </thead>
              <tbody>
                {report.evidence.map((entry, index) => (
                  <tr key={index}>
                    <td className="p-1">{fieldLabels[entry.field] ?? entry.field}</td>
                    <td className="p-1 font-mono">
                      {entry.source.kind}:{' '}
                      {'selector' in entry.source
                        ? entry.source.selector
                        : entry.source.path.join('.')}
                    </td>
                    <td className="p-1">{String(entry.raw ?? '')}</td>
                    <td className="p-1">{String(entry.value ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {!!report.trace?.length && (
        <p className="text-muted-foreground">
          {report.trace
            .map((step) => step.stage + ': ' + step.status + ' (' + step.durationMs + 'ms)')
            .join(' | ')}
        </p>
      )}
    </div>
  );
}
