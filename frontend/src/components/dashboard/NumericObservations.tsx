'use client';
import * as React from 'react';
import { ChartPointTooltip } from './ChartPointTooltip';
import {
  numericScale,
  axisLabels,
  SCALE_MODE,
  compressNumericObservations,
  type Observation,
} from '@/lib/chartUtils';

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
  const [hovered, setHovered] = React.useState<{ point: Observation; x: number; y: number } | null>(null);

  const points = React.useMemo(
    () => observations.filter((p) => typeof p.value === 'number'),
    [observations]
  );
  const displayPoints = React.useMemo(
    () => compressNumericObservations(points),
    [points]
  );

  const { min, max, ticks } = numericScale(
    points.map((p) => p.value as number),
    mode === SCALE_MODE.Zero
  );
  const labels = axisLabels(ticks);
  const times = observations.map((p) => p.timestamp).filter(Number.isFinite);
  const start = times.length ? Math.min(...times) : 0;
  const end = times.length ? Math.max(...times) : 0;
  const magnitude = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const y = (value: number) =>
    180 - ((value / magnitude - min / magnitude) / (max / magnitude - min / magnitude)) * 155;

  const getX = (ts: number) =>
    end === start ? 365 : 110 + ((ts - start) / (end - start)) * 510;
  const showTooltip = (point: Observation, element: SVGCircleElement) => {
    const svg = element.ownerSVGElement;
    if (!svg) return;
    const pointRect = element.getBoundingClientRect();
    setHovered({ point, x: pointRect.left + pointRect.width / 2, y: pointRect.top });
  };

  const stepPath = React.useMemo(() => {
    if (displayPoints.length < 2) return '';
    let d = `M ${getX(displayPoints[0]!.timestamp)} ${y(displayPoints[0]!.value as number)}`;
    for (let i = 1; i < displayPoints.length; i++) {
      const xCurr = getX(displayPoints[i]!.timestamp);
      const yCurr = y(displayPoints[i]!.value as number);
      d += ` H ${xCurr} V ${yCurr}`;
    }
    return d;
  }, [displayPoints, start, end, magnitude, min, max]);

  const areaPath = React.useMemo(() => {
    if (!stepPath || displayPoints.length < 2) return '';
    const firstX = getX(displayPoints[0]!.timestamp);
    return `${stepPath} V 180 H ${firstX} Z`;
  }, [stepPath, displayPoints, start, end]);

  if (!points.length) return <p className="text-sm text-muted-foreground">No valid numeric readings.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={mode === SCALE_MODE.Zero}
            onChange={(e) => setMode(e.target.checked ? SCALE_MODE.Zero : SCALE_MODE.Adjusted)}
            className="rounded border-border text-primary focus:ring-primary"
          />
          Include zero in Y-axis
        </label>
        {points.length > displayPoints.length && (
          <span className="text-muted-foreground font-mono">
            Compressed {points.length - displayPoints.length} plateau points
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="relative">
        <svg
          viewBox="0 0 640 225"
          className="w-full min-w-[32rem]"
          role="img"
          aria-label="Observed numeric values over collection time."
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

          {/* Area fill */}
          {areaPath && <path d={areaPath} fill="currentColor" opacity="0.08" />}

          {/* Step line */}
          {stepPath && (
            <path
              d={stepPath}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.85"
            />
          )}

          {/* Change points */}
          {displayPoints.map((point) => (
            <circle
              key={point.run.id}
              cx={getX(point.timestamp)}
              cy={y(point.value as number)}
              r="7"
              fill="currentColor"
              className="cursor-pointer focus:outline-none focus-visible:stroke-primary hover:r-5 transition-all"
              tabIndex={0}
              onMouseEnter={(event) => showTooltip(point, event.currentTarget)}
              onMouseLeave={() => setHovered(null)}
              onFocus={(event) => showTooltip(point, event.currentTarget)}
              onBlur={() => setHovered(null)}
              aria-label={`${formatTime(point.run.executedAt)}: ${formatValue(point.value as number)}`}
            />
          ))}

          <text x="110" y="215" fill="currentColor" fontSize="10">
            {formatTime(new Date(start).toISOString())}
          </text>
          <text x="620" y="215" textAnchor="end" fill="currentColor" fontSize="10">
            {formatTime(new Date(end).toISOString())}
          </text>
        </svg>
        {hovered && (
          <ChartPointTooltip x={hovered.x} y={hovered.y}>
            <span className="font-semibold">{formatTime(hovered.point.run.executedAt)}</span>: {formatValue(hovered.point.value as number)}
          </ChartPointTooltip>
        )}
        </div>
      </div>
    </div>
  );
}
