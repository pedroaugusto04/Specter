import type { Observation } from '@/lib/chartUtils';
import * as React from 'react';
import { ChartPointTooltip } from './ChartPointTooltip';
export function StateObservations({
  observations,
  formatTime,
  boolean = false,
}: {
  observations: Observation[];
  formatTime: (date: string) => string;
  boolean?: boolean;
}) {
  const [hovered, setHovered] = React.useState<{ point: Observation; x: number; y: number } | null>(null);
  const showTooltip = (point: Observation, element: SVGCircleElement) => {
    const svg = element.ownerSVGElement;
    if (!svg) return;
    const pointRect = element.getBoundingClientRect();
    setHovered({ point, x: pointRect.left + pointRect.width / 2, y: pointRect.top });
  };
  const valid = observations.filter((p) => p.value !== null);
  const categories: (string | number | boolean | null)[] = boolean
    ? [false, true]
    : [
      ...new Set(valid.map((p) => p.value)).values(),
    ].sort((a, b) => String(a).localeCompare(String(b)));
  if (observations.some((p) => p.value === null)) categories.push(null);
  const times = observations.map((p) => p.timestamp).filter(Number.isFinite);
  if (!observations.length) return <p>No state observations.</p>;
  const start = times.length ? Math.min(...times) : 0;
  const end = times.length ? Math.max(...times) : 0;
  return (
    <div className="max-h-80 overflow-auto">
      {categories.map((category) => (
        <div key={category === null ? 'unavailable' : String(category)} className="grid grid-cols-[10rem_1fr] items-center gap-2 py-2">
          <span className="break-words">{category === null ? 'Unavailable' : String(category)}</span>
          <div className="relative">
          <svg
            viewBox="0 0 500 24"
            className="w-full min-w-48"
            role="img"
            aria-label={`Observations for ${category === null ? 'unavailable readings' : String(category)}`}
          >
            <line x1="8" x2="492" y1="12" y2="12" stroke="currentColor" opacity="0.15" />
            {observations
              .filter((p) => p.value === category)
              .map((p) => (
                <circle
                  key={p.run.id}
                  cx={
                    !Number.isFinite(p.timestamp) || start === end
                      ? 250
                      : 8 + ((p.timestamp - start) / (end - start)) * 484
                  }
                  cy="12"
                  r="8"
                  fill={category === null ? 'none' : 'currentColor'}
                  stroke="currentColor"
                  strokeDasharray={category === null ? '2 1' : undefined}
                  className="cursor-pointer focus:outline-none focus-visible:stroke-primary"
                  tabIndex={0}
                  onMouseEnter={(event) => showTooltip(p, event.currentTarget)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={(event) => showTooltip(p, event.currentTarget)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${formatTime(p.run.executedAt)}: ${category === null ? 'Unavailable observation' : String(category)}`}
                >
                </circle>
              ))}
          </svg>
          {hovered && observations.some((p) => p.run.id === hovered.point.run.id && p.value === category) && (
            <ChartPointTooltip x={hovered.x} y={hovered.y}>
              <span className="font-medium">{formatTime(hovered.point.run.executedAt)}</span>: {hovered.point.value === null ? 'Unavailable observation' : String(hovered.point.value)}
            </ChartPointTooltip>
          )}
          </div>
        </div>
      ))}
    </div>
  );
}
