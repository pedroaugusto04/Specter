'use client';

import * as React from 'react';
import { ExternalLink } from 'lucide-react';

export interface ScreenshotLightboxProps {
  screenshotUrl: string | null;
  onClose: () => void;
}

export function ScreenshotLightbox({ screenshotUrl, onClose }: ScreenshotLightboxProps) {
  if (!screenshotUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot lightbox"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs">
          <span className="font-mono text-muted-foreground">Snapshot Lightbox</span>
          <div className="flex items-center gap-2">
            <a
              href={screenshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              Open in new tab <ExternalLink className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-auto p-2">
          <img
            src={screenshotUrl}
            alt="Visual Proof Snapshot Full"
            className="w-full rounded-lg object-contain shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}
