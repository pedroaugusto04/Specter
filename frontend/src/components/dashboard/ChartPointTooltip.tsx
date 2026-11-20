'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

export function ChartPointTooltip({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
}) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ left: x, top: y - 8, below: false });

  React.useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    const bounds = tooltip.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const left = Math.min(
      window.innerWidth - bounds.width / 2 - margin,
      Math.max(bounds.width / 2 + margin, x)
    );
    const hasRoomAbove = y - bounds.height - gap >= margin;
    const below = !hasRoomAbove;
    const top = below
      ? Math.min(window.innerHeight - bounds.height - margin, y + gap)
      : y - gap;

    setPosition({ left, top, below });
  }, [x, y, children]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={tooltipRef}
      role="status"
      className="pointer-events-none fixed z-[9999] rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl font-mono whitespace-nowrap"
      style={{
        left: position.left,
        top: position.top,
        transform: position.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
    >
      {children}
    </div>,
    document.body
  );
}
