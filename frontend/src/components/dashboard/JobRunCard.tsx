'use client';
import { runProgressPill } from '@/lib/runProgress';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { VisualDiffSlider } from '@/components/dashboard/VisualDiffSlider';
import type { JobRunDto } from '@/lib/api';
import { ChangeStatus, RunStatus } from '@specter/contracts';
import { formatDateTime, parseErrorMessage } from '@/lib/utils';
import { localizeExtractedPayload, type ExtractionFieldDefinitions } from '@/lib/extractionDisplay';
import { USER_FAILURES } from '@specter/contracts';
import { AlertCircle, Camera, SlidersHorizontal, ZoomIn } from 'lucide-react';

interface JobRunCardProps {
  run: JobRunDto;
  isSelected: boolean;
  timeZone: string;
  extractionFields?: ExtractionFieldDefinitions;
  previousScreenshot?: string | null;
  previousRunDate?: string;
  onOpenScreenshot: (url: string) => void;
}

export function JobRunCard({
  run,
  isSelected,
  timeZone,
  extractionFields,
  previousScreenshot,
  previousRunDate,
  onOpenScreenshot,
}: JobRunCardProps) {
  const parsedError = run.errorMessage
    ? parseErrorMessage(run.errorMessage)
    : run.status === RunStatus.Failed
      ? USER_FAILURES.requestFailed
      : null;

  const isChangeWithDiff =
    run.hasChanges === ChangeStatus.Changed &&
    Boolean(run.screenshotUrl) &&
    Boolean(previousScreenshot);

  return (
    <div
      id={`run-card-${run.id}`}
      className={`rounded-lg border bg-card p-4 sm:p-5 transition-all ${
        isSelected ? 'border-primary ring-1 ring-primary/40 bg-muted/10' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Badge
            variant={
              run.status === RunStatus.Success
                ? 'success'
                : run.status === RunStatus.Failed
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {run.status === RunStatus.Running ? (
              <span className="inline-flex items-center gap-1.5">
                <span>{runProgressPill(run)}</span>
                <LoadingSpinner size="xs" />
              </span>
            ) : (
              (run.extractionReport?.quality ?? run.status)
            )}
          </Badge>
          <Badge
            variant={
              run.hasChanges === ChangeStatus.Changed
                ? 'warning'
                : run.hasChanges === ChangeStatus.Initial
                  ? 'default'
                  : 'secondary'
            }
          >
            Change: {run.hasChanges}
          </Badge>
          {run.recoveredAutomatically && (
            <Badge variant="secondary">Recovered automatically</Badge>
          )}
          {run.httpStatus && (
            <span className="font-mono text-xs text-muted-foreground">HTTP {run.httpStatus}</span>
          )}
          {run.durationMs !== null && (
            <span className="font-mono text-xs text-muted-foreground">{run.durationMs}ms</span>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {formatDateTime(run.executedAt, timeZone)}
        </span>
      </div>

      {parsedError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs sm:text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{parsedError.title}</p>
              <details className="mt-2">
                <summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                  View failure details
                </summary>
                <p className="mt-2 leading-relaxed">{parsedError.description}</p>
                <p className="mt-2 font-medium">What you can do</p>
                <p className="mt-1 leading-relaxed">{parsedError.nextStep}</p>
              </details>
            </div>
          </div>
        </div>
      )}

      {run.screenshotUrl && (
        <div className="mt-3 overflow-hidden rounded-md border border-border bg-muted/20">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground font-medium">
            <span className="flex items-center gap-1.5 font-mono">
              {isChangeWithDiff ? (
                <>
                  <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                  Visual Diff (Before vs After)
                </>
              ) : (
                <>
                  <Camera className="h-3.5 w-3.5 text-primary" />
                  Visual Snapshot Proof
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => onOpenScreenshot(run.screenshotUrl!)}
              className="flex items-center gap-1 text-xs text-primary hover:underline font-mono cursor-pointer"
            >
              <ZoomIn className="h-3 w-3" />
              Zoom
            </button>
          </div>
          <div className="p-3">
            {isChangeWithDiff && previousScreenshot ? (
              <VisualDiffSlider
                previousUrl={previousScreenshot}
                currentUrl={run.screenshotUrl}
                previousLabel="Previous"
                currentLabel="Current"
                previousDate={previousRunDate}
                currentDate={formatDateTime(run.executedAt, timeZone)}
                onOpenZoom={(url) => onOpenScreenshot(url)}
              />
            ) : (
              <div
                className="relative cursor-pointer overflow-hidden rounded-lg max-h-60"
                onClick={() => onOpenScreenshot(run.screenshotUrl!)}
              >
                <img
                  src={run.screenshotUrl}
                  alt="Visual snapshot"
                  className="w-full object-cover object-top"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {run.extractedData && (
        <pre className="mt-2.5 max-h-56 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs text-foreground">
          {JSON.stringify(localizeExtractedPayload(run.extractedData, extractionFields), null, 2)}
        </pre>
      )}
    </div>
  );
}
