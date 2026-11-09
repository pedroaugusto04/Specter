'use client';

import * as React from 'react';
import {
  ArrowLeftRight,
  Camera,
  ChevronsLeftRight,
  Columns2,
  Eye,
  SlidersHorizontal,
  ZoomIn,
} from 'lucide-react';

export interface VisualDiffSliderProps {
  previousUrl: string;
  currentUrl: string;
  previousLabel?: string;
  currentLabel?: string;
  previousDate?: string;
  currentDate?: string;
  onOpenZoom?: (url: string) => void;
}

type DiffViewMode = 'toggle' | 'sideBySide' | 'split';

export function VisualDiffSlider({
  previousUrl,
  currentUrl,
  previousLabel = 'Previous',
  currentLabel = 'Current',
  previousDate,
  currentDate,
  onOpenZoom,
}: VisualDiffSliderProps) {
  const [mode, setMode] = React.useState<DiffViewMode>('toggle');
  const [activeView, setActiveView] = React.useState<'current' | 'previous'>('current');
  const [isPeeking, setIsPeeking] = React.useState(false);

  // Split-curtain state
  const [sliderPosition, setSliderPosition] = React.useState(50);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);

  const displayedInToggle = isPeeking ? 'previous' : activeView;
  const currentDisplayedUrl = displayedInToggle === 'current' ? currentUrl : previousUrl;

  const updatePosition = React.useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.min(Math.max((x / rect.width) * 100, 0), 100);
    setSliderPosition(percentage);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    updatePosition(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if already released
    }
  };

  return (
    <div className="space-y-3">
      {/* View Mode Switcher Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('toggle')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono font-medium transition-colors cursor-pointer ${
              mode === 'toggle'
                ? 'bg-card text-foreground shadow-xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="A/B Flip: Compare without split distortion (Recommended)"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span>A/B Flip</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('sideBySide')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono font-medium transition-colors cursor-pointer ${
              mode === 'sideBySide'
                ? 'bg-card text-foreground shadow-xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Side by Side: View both captures together"
          >
            <Columns2 className="h-3.5 w-3.5" />
            <span>Side by Side</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('split')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono font-medium transition-colors cursor-pointer ${
              mode === 'split'
                ? 'bg-card text-foreground shadow-xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Split Curtain: Drag slider across images"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Curtain</span>
          </button>
        </div>

        {onOpenZoom && (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <button
              type="button"
              onClick={() => onOpenZoom(previousUrl)}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              Zoom Previous
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => onOpenZoom(currentUrl)}
              className="hover:text-primary transition-colors cursor-pointer font-medium text-foreground"
            >
              Zoom Current
            </button>
          </div>
        )}
      </div>

      {/* MODE 1: A/B FLIP (RECOMMENDED DEFAULT) */}
      {mode === 'toggle' && (
        <div className="space-y-2.5">
          {/* Segmented A/B Switch + Hold to Peek */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveView('previous')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-mono font-medium transition-all cursor-pointer ${
                  displayedInToggle === 'previous'
                    ? 'bg-background text-foreground shadow-xs border border-border/80'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>◀ {previousLabel}</span>
                {previousDate && (
                  <span className="text-[10px] opacity-75 font-normal">({previousDate})</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveView('current')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-mono font-medium transition-all cursor-pointer ${
                  displayedInToggle === 'current'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>● {currentLabel}</span>
                {currentDate && (
                  <span className="text-[10px] opacity-90 font-normal">({currentDate})</span>
                )}
              </button>
            </div>

            <button
              type="button"
              onPointerDown={() => setIsPeeking(true)}
              onPointerUp={() => setIsPeeking(false)}
              onPointerLeave={() => setIsPeeking(false)}
              onPointerCancel={() => setIsPeeking(false)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-mono transition-all cursor-pointer select-none ${
                isPeeking
                  ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold shadow-xs'
                  : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
              title="Hold mouse down to temporarily peek at the Previous capture"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{isPeeking ? 'Showing Previous...' : 'Hold to Peek Previous'}</span>
            </button>
          </div>

          {/* Full-size Image Display with unambiguous label badge */}
          <div
            className="group relative select-none overflow-hidden rounded-lg border border-border bg-black/5 dark:bg-black/30 h-72 sm:h-96 flex items-center justify-center cursor-pointer shadow-inner"
            onClick={() => onOpenZoom?.(currentDisplayedUrl)}
            title="Click to zoom full screen"
          >
            <img
              src={currentDisplayedUrl}
              alt={displayedInToggle === 'current' ? 'Current capture' : 'Previous capture'}
              className="h-full w-full object-cover sm:object-contain object-top"
              loading="lazy"
            />

            {/* Clear Status Badge */}
            <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono font-semibold uppercase tracking-wider backdrop-blur-md shadow-sm border border-border/50 pointer-events-none">
              {displayedInToggle === 'current' ? (
                <span className="flex items-center gap-1.5 text-primary-foreground bg-primary/95 px-2 py-0.5 rounded shadow-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                  Showing: {currentLabel}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-foreground bg-background/90 px-2 py-0.5 rounded shadow-xs border border-border">
                  <Eye className="h-3 w-3 text-amber-500" />
                  Showing: {previousLabel} {isPeeking && '(Peeking)'}
                </span>
              )}
            </div>

            {/* Hover overlay hint */}
            <div className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1 rounded bg-background/80 px-2 py-1 text-[11px] font-mono text-muted-foreground backdrop-blur-sm border border-border/60 opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none">
              <ZoomIn className="h-3 w-3 text-primary" />
              Click to zoom
            </div>
          </div>

          <p className="text-[11px] font-mono text-muted-foreground text-center">
            Tip: Flip between <span className="font-semibold text-foreground">{previousLabel}</span>{' '}
            and <span className="font-semibold text-foreground">{currentLabel}</span> or hold the
            peek button to spot differences instantly.
          </p>
        </div>
      )}

      {/* MODE 2: SIDE BY SIDE */}
      {mode === 'sideBySide' && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Previous Capture */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono px-1">
                <span className="font-semibold text-muted-foreground">
                  ◀ {previousLabel} {previousDate && `(${previousDate})`}
                </span>
                {onOpenZoom && (
                  <button
                    type="button"
                    onClick={() => onOpenZoom(previousUrl)}
                    className="text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Zoom
                  </button>
                )}
              </div>
              <div
                className="group relative select-none overflow-hidden rounded-lg border border-border bg-black/5 dark:bg-black/30 h-64 sm:h-80 flex items-center justify-center cursor-pointer shadow-inner"
                onClick={() => onOpenZoom?.(previousUrl)}
              >
                <img
                  src={previousUrl}
                  alt="Previous capture"
                  className="h-full w-full object-cover object-top"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Current Capture */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono px-1">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />● {currentLabel}{' '}
                  {currentDate && `(${currentDate})`}
                </span>
                {onOpenZoom && (
                  <button
                    type="button"
                    onClick={() => onOpenZoom(currentUrl)}
                    className="text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Zoom
                  </button>
                )}
              </div>
              <div
                className="group relative select-none overflow-hidden rounded-lg border border-primary/50 bg-black/5 dark:bg-black/30 h-64 sm:h-80 flex items-center justify-center cursor-pointer shadow-inner"
                onClick={() => onOpenZoom?.(currentUrl)}
              >
                <img
                  src={currentUrl}
                  alt="Current capture"
                  className="h-full w-full object-cover object-top"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

          <p className="text-[11px] font-mono text-muted-foreground text-center">
            Left: Prior execution • Right: Latest execution. Click any image to view full size.
          </p>
        </div>
      )}

      {/* MODE 3: SPLIT CURTAIN */}
      {mode === 'split' && (
        <div className="space-y-2">
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative select-none overflow-hidden rounded-lg border border-border bg-muted/30 shadow-inner group cursor-ew-resize h-64 sm:h-80"
          >
            {/* Current Image (Background / Right) */}
            <img
              src={currentUrl}
              alt="Current visual capture"
              className="absolute inset-0 h-full w-full object-cover object-top pointer-events-none"
              loading="lazy"
            />

            {/* Previous Image (Clipped / Left) */}
            <div
              className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-primary shadow-[0_0_12px_rgba(0,0,0,0.5)]"
              style={{ width: `${sliderPosition}%` }}
            >
              <div
                className="absolute inset-0 h-full pointer-events-none"
                style={{
                  width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100%',
                }}
              >
                <img
                  src={previousUrl}
                  alt="Previous visual capture"
                  className="h-full w-full object-cover object-top"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Floating Badges with positional clarity */}
            <span className="absolute top-2.5 left-2.5 z-10 rounded bg-background/85 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm border border-border shadow-sm pointer-events-none">
              ← Left: {previousLabel}
            </span>
            <span className="absolute top-2.5 right-2.5 z-10 rounded bg-primary/90 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary-foreground backdrop-blur-sm shadow-sm pointer-events-none">
              Right: {currentLabel} →
            </span>

            {/* Drag Handle Bar and Knob */}
            <div
              className="absolute inset-y-0 z-20 flex items-center justify-center -translate-x-1/2 pointer-events-none"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-primary bg-background shadow-lg text-primary transition-transform group-hover:scale-110">
                <ChevronsLeftRight className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground px-1">
            <span>Drag slider to compare (Left: Previous • Right: Current)</span>
            <span>{Math.round(sliderPosition)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
