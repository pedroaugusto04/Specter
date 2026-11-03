'use client';

import * as React from 'react';
import { ChevronsLeftRight } from 'lucide-react';

interface VisualDiffSliderProps {
  previousUrl: string;
  currentUrl: string;
  previousLabel?: string;
  currentLabel?: string;
  onOpenZoom?: (url: string) => void;
}

export function VisualDiffSlider({
  previousUrl,
  currentUrl,
  previousLabel = 'Previous',
  currentLabel = 'Current',
  onOpenZoom,
}: VisualDiffSliderProps) {
  const [sliderPosition, setSliderPosition] = React.useState(50);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);

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
    <div className="space-y-2">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative select-none overflow-hidden rounded-lg border border-border bg-black/5 dark:bg-black/30 shadow-inner cursor-ew-resize aspect-video max-h-80 w-full"
      >
        {/* Current Image (Background / Right) */}
        <img
          src={currentUrl}
          alt="Current visual capture"
          className="absolute inset-0 h-full w-full object-contain select-none pointer-events-none"
          loading="lazy"
        />

        {/* Previous Image (Clipped with CSS clipPath / Left) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <img
            src={previousUrl}
            alt="Previous visual capture"
            className="h-full w-full object-contain select-none"
            loading="lazy"
          />
        </div>

        {/* Floating Badges */}
        <span className="absolute top-2.5 left-2.5 z-10 rounded bg-background/85 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm border border-border shadow-sm pointer-events-none">
          {previousLabel}
        </span>
        <span className="absolute top-2.5 right-2.5 z-10 rounded bg-primary/90 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary-foreground backdrop-blur-sm shadow-sm pointer-events-none">
          {currentLabel}
        </span>

        {/* Drag Handle Bar and Knob */}
        <div
          className="absolute inset-y-0 z-20 flex items-center justify-center -translate-x-1/2 pointer-events-none"
          style={{ left: `${sliderPosition}%` }}
        >
          <div className="h-full w-0.5 bg-primary shadow-[0_0_8px_rgba(0,0,0,0.6)]" />
          <div className="absolute flex h-7 w-7 items-center justify-center rounded-full border-2 border-primary bg-background shadow-lg text-primary">
            <ChevronsLeftRight className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Helper caption & Range Slider fallback for accessibility / precise touch */}
      <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground px-1">
        <span>Drag to compare</span>
        {onOpenZoom && (
          <div className="flex items-center gap-2">
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
              className="hover:text-primary transition-colors cursor-pointer"
            >
              Zoom Current
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
