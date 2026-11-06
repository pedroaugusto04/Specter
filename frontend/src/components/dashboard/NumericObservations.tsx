'use client';
import * as React from 'react';
import { numericScale, axisLabels, SCALE_MODE, type Observation } from '@/lib/chartUtils';

export function NumericObservations({
  observations,
  formatTime,
  formatValue,
}: {
  observations: Observation[];
  formatTime: (date: string) => string;
  formatValue: (value: number) => string;
}) {
  const [mode, setMode] = React.useState<string>(SCALE_MODE.Adjusted);
  const [hovered, setHovered] = React.useState<Observation | null>(null);
  const points = observations.filter((p) => typeof p.value === 'number');
  const { min, max, ticks } = numericScale(
    points.map((p) => p.value as number),
    mode === SCALE_MODE.Zero
  );
  const labels = axisLabels(ticks);
  const times = observations.map((p) => p.timestamp).filter(Number.isFinite);
  if (!points.length) return <p>No valid numeric readings.</p>;
  const start = Math.min(...times),
    end = Math.max(...times);
  const magnitude = Math.max(Math.abs(min), Math.abs(max));
  const y = (value: number) =>
    180 - ((value / magnitude - min / magnitude) / (max / magnitude - min / magnitude)) * 155;
  return (
    <div className="space-y-3">
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={mode === SCALE_MODE.Zero}
          onChange={(e) => setMode(e.target.checked ? SCALE_MODE.Zero : SCALE_MODE.Adjusted)}
        />
        Include zero
      </label>
      <p className="text-muted-foreground">
        {mode === SCALE_MODE.Adjusted ? 'Scale adjusted to observed values' : 'Scale includes zero'}
        . Points represent collection times; values between collections are unknown.
      </p>
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 640 225"
          className="w-full min-w-[32rem]"
          role="img"
          aria-label="Observed numeric values over collection time. Exact readings in the table below."
        >
          {ticks.map((tick, index) => (
            <g key={index}>
              <line
                x1="110"
                x2="620"
                y1={y(tick)}
                y2={y(tick)}
                stroke="currentColor"
                opacity="0.15"
              />
              <text x="102" y={y(tick) + 4} textAnchor="end" fill="currentColor" fontSize="11">
                {labels[index]}
              </text>
            </g>
          ))}
          {points.map((point) => (
            <circle
              key={point.run.id}
              cx={end === start ? 365 : 110 + ((point.timestamp - start) / (end - start)) * 510}
              cy={y(point.value as number)}
              r="4"
              fill="currentColor"
              className="cursor-pointer focus:outline-none focus-visible:stroke-primary"
              tabIndex={0}
              onMouseEnter={() => setHovered(point)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(point)}
              onBlur={() => setHovered(null)}
              aria-label={`${formatTime(point.run.executedAt)}: ${formatValue(point.value as number)}`}
            >
            </circle>
          ))}
          <text x="110" y="215" fill="currentColor" fontSize="10">
            {formatTime(new Date(start).toISOString())}
          </text>
          <text x="620" y="215" textAnchor="end" fill="currentColor" fontSize="10">
            {formatTime(new Date(end).toISOString())}
          </text>
        </svg>
      </div>
      {hovered && (
        <div role="status" className="inline-block rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
          <span className="font-medium">{formatTime(hovered.run.executedAt)}</span>: {formatValue(hovered.value as number)}
        </div>
      )}
      {points.length === 1 ? (
        <p>Insufficient history for a trend.</p>
      ) : (
        points.every((p) => p.value === points[0].value) && <p>No observed variation.</p>
      )}
    </div>
  );
}
