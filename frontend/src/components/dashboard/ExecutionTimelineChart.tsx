'use client';

import * as React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Camera,
  CheckCircle2,
  Clock,
  GitCompare,
  TrendingUp,
} from 'lucide-react';
import type { JobRunDto } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  buildChartDataPoints,
  calculateRunMetrics,
  detectNumericFields,
  formatNumericValue,
  type ChartDataPoint,
} from '@/lib/chartUtils';
import { formatCompactDate, formatDateTime } from '@/lib/utils';

interface ExecutionTimelineChartProps {
  runs: JobRunDto[];
  timeZone?: string;
  onSelectRun?: (run: JobRunDto) => void;
  onOpenScreenshot?: (url: string) => void;
}

export function ExecutionTimelineChart({
  runs,
  timeZone = 'UTC',
  onSelectRun,
  onOpenScreenshot,
}: ExecutionTimelineChartProps) {
  const metrics = React.useMemo(() => calculateRunMetrics(runs), [runs]);
  const numericFields = React.useMemo(() => detectNumericFields(runs), [runs]);

  const [selectedField, setSelectedField] = React.useState<string>(() => {
    return numericFields[0]?.key || '';
  });

  // Keep selectedField in sync if fields change
  React.useEffect(() => {
    if (numericFields.length > 0 && !numericFields.some((f) => f.key === selectedField)) {
      setSelectedField(numericFields[0].key);
    }
  }, [numericFields, selectedField]);

  const chartPoints = React.useMemo(() => {
    if (!selectedField) return [];
    return buildChartDataPoints(runs, selectedField, timeZone);
  }, [runs, selectedField, timeZone]);

  // Points that have valid numeric values
  const validPoints = React.useMemo(() => {
    return chartPoints.filter((p) => p.numericValue !== null);
  }, [chartPoints]);

  // Runs that had detected changes or failures
  const changeRuns = React.useMemo(() => {
    return runs.filter(
      (r) => r.hasChanges === 'YES' || r.hasChanges === 'INITIAL' || r.status === 'FAILED'
    );
  }, [runs]);

  // SVG Chart Geometry
  const width = 640;
  const height = 220;
  const padTop = 20;
  const padBottom = 32;
  const padLeft = 60;
  const padRight = 24;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const { minVal, maxVal } = React.useMemo(() => {
    if (validPoints.length === 0) return { minVal: 0, maxVal: 100 };
    let min = Infinity;
    let max = -Infinity;
    for (const p of validPoints) {
      if (p.numericValue !== null) {
        if (p.numericValue < min) min = p.numericValue;
        if (p.numericValue > max) max = p.numericValue;
      }
    }
    if (min === max) {
      const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
      return { minVal: min - pad, maxVal: max + pad };
    }
    const delta = max - min;
    const pad = delta * 0.1;
    return { minVal: min - pad, maxVal: max + pad };
  }, [validPoints]);

  const getY = React.useCallback(
    (val: number) => {
      const range = maxVal - minVal;
      if (range <= 0) return padTop + plotHeight / 2;
      return padTop + plotHeight - ((val - minVal) / range) * plotHeight;
    },
    [maxVal, minVal, plotHeight]
  );

  const getX = React.useCallback(
    (index: number) => {
      if (validPoints.length <= 1) return padLeft + plotWidth / 2;
      return padLeft + (index / (validPoints.length - 1)) * plotWidth;
    },
    [validPoints.length, plotWidth]
  );

  // Build Step-After SVG Path
  const { linePath, areaPath } = React.useMemo(() => {
    if (validPoints.length === 0) return { linePath: '', areaPath: '' };

    const coords = validPoints.map((p, idx) => ({
      x: getX(idx),
      y: getY(p.numericValue!),
    }));

    // Step-after line: M x0 y0 L x1 y0 L x1 y1 ...
    let lineD = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      lineD += ` L ${curr.x} ${prev.y} L ${curr.x} ${curr.y}`;
    }

    const baselineY = padTop + plotHeight;
    const lastCoord = coords[coords.length - 1];
    const firstCoord = coords[0];
    const areaD = `${lineD} L ${lastCoord.x} ${baselineY} L ${firstCoord.x} ${baselineY} Z`;

    return { linePath: lineD, areaPath: areaD };
  }, [validPoints, getX, getY, plotHeight]);

  // Interactive Hover State
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const activePoint = hoverIndex !== null ? validPoints[hoverIndex] : null;
  const activePointCoords =
    hoverIndex !== null
      ? {
          x: getX(hoverIndex),
          y: getY(validPoints[hoverIndex].numericValue!),
        }
      : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (validPoints.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;

    // Find nearest point
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < validPoints.length; i++) {
      const px = getX(i);
      const dist = Math.abs(px - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    setHoverIndex(closestIdx);
  };

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-xs sm:text-sm text-muted-foreground">
        No execution data available to build timeline charts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-mono font-medium uppercase tracking-wider">
              Total Runs
            </span>
            <Activity className="h-3.5 w-3.5" />
          </div>
          <div className="font-mono text-xl font-semibold text-foreground">{metrics.totalRuns}</div>
          <div className="text-[11px] font-mono text-muted-foreground">
            {metrics.successRuns} succeeded • {metrics.failedRuns} failed
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-mono font-medium uppercase tracking-wider">
              Detected Changes
            </span>
            <GitCompare className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="font-mono text-xl font-semibold text-amber-500">{metrics.changeRuns}</div>
          <div className="text-[11px] font-mono text-muted-foreground">
            {metrics.changeRatePercent.toFixed(1)}% change frequency
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-mono font-medium uppercase tracking-wider">
              Latest Change
            </span>
            <Clock className="h-3.5 w-3.5" />
          </div>
          <div className="font-mono text-xs font-semibold text-foreground truncate">
            {metrics.lastChangeAt ? formatCompactDate(metrics.lastChangeAt, timeZone) : 'None'}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            {metrics.lastChangeAt ? 'State transition' : 'Stable baseline'}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-mono font-medium uppercase tracking-wider">
              Avg Latency
            </span>
            <TrendingUp className="h-3.5 w-3.5" />
          </div>
          <div className="font-mono text-xl font-semibold text-foreground">
            {metrics.averageDurationMs !== null ? `${metrics.averageDurationMs}ms` : '—'}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">Scraper response time</div>
        </div>
      </div>

      {/* Value Evolution Section */}
      {numericFields.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                Value Evolution (Step-Line Trend)
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Temporal value progression plotted over chronological executions.
              </p>
            </div>

            {/* Field Selector */}
            {numericFields.length > 1 && (
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
                {numericFields.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => setSelectedField(field.key)}
                    className={`rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors cursor-pointer ${
                      selectedField === field.key
                        ? 'bg-card text-foreground shadow-2xs border border-border'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {field.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* SVG Chart Container */}
          <div className="relative overflow-hidden rounded-md border border-border/80 bg-muted/15 p-2">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-56 sm:h-64 overflow-visible select-none"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    className="text-primary"
                    stopOpacity="0.18"
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    className="text-primary"
                    stopOpacity="0.0"
                  />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
              {[0, 0.33, 0.66, 1].map((pct) => {
                const y = padTop + plotHeight * pct;
                const valueLabel = formatNumericValue(maxVal - pct * (maxVal - minVal));
                return (
                  <g key={pct}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={width - padRight}
                      y2={y}
                      stroke="currentColor"
                      className="text-border"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-muted-foreground font-mono text-[10px]"
                    >
                      {valueLabel}
                    </text>
                  </g>
                );
              })}

              {/* Area & Line */}
              {areaPath && <path d={areaPath} fill="url(#areaGradient)" />}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="currentColor"
                  className="text-primary"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              )}

              {/* Data points */}
              {validPoints.map((point, idx) => {
                const cx = getX(idx);
                const cy = getY(point.numericValue!);
                const isChange = point.hasChanges === 'YES';
                const isInitial = point.hasChanges === 'INITIAL';

                if (isChange) {
                  return (
                    <g key={point.runId}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r="7"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                        opacity="0.8"
                      />
                      <circle cx={cx} cy={cy} r="3.5" fill="#f59e0b" />
                    </g>
                  );
                }

                if (isInitial) {
                  return (
                    <circle
                      key={point.runId}
                      cx={cx}
                      cy={cy}
                      r="4"
                      fill="currentColor"
                      className="text-foreground"
                    />
                  );
                }

                return (
                  <circle
                    key={point.runId}
                    cx={cx}
                    cy={cy}
                    r="2.5"
                    fill="currentColor"
                    className="text-muted-foreground/60"
                  />
                );
              })}

              {/* Active Hover Crosshair */}
              {activePointCoords && (
                <g>
                  <line
                    x1={activePointCoords.x}
                    y1={padTop}
                    x2={activePointCoords.x}
                    y2={padTop + plotHeight}
                    stroke="currentColor"
                    className="text-primary/70"
                    strokeDasharray="2 2"
                    strokeWidth="1"
                  />
                  <circle
                    cx={activePointCoords.x}
                    cy={activePointCoords.y}
                    r="7"
                    fill="none"
                    stroke="currentColor"
                    className="text-primary"
                    strokeWidth="2"
                  />
                  <circle
                    cx={activePointCoords.x}
                    cy={activePointCoords.y}
                    r="3.5"
                    fill="currentColor"
                    className="text-foreground"
                  />
                </g>
              )}

              {/* X-axis date labels */}
              {validPoints.length > 0 && (
                <g>
                  <text
                    x={padLeft}
                    y={height - 8}
                    textAnchor="start"
                    className="fill-muted-foreground font-mono text-[10px]"
                  >
                    {validPoints[0].formattedCompactTime}
                  </text>
                  {validPoints.length > 2 && (
                    <text
                      x={padLeft + plotWidth / 2}
                      y={height - 8}
                      textAnchor="middle"
                      className="fill-muted-foreground font-mono text-[10px]"
                    >
                      {validPoints[Math.floor(validPoints.length / 2)].formattedCompactTime}
                    </text>
                  )}
                  <text
                    x={width - padRight}
                    y={height - 8}
                    textAnchor="end"
                    className="fill-muted-foreground font-mono text-[10px]"
                  >
                    {validPoints[validPoints.length - 1].formattedCompactTime}
                  </text>
                </g>
              )}
            </svg>

            {/* Hover Floating Tooltip */}
            {activePoint && activePointCoords && (
              <div
                className="pointer-events-none absolute top-4 z-50 rounded-md border border-border bg-card p-3 text-xs font-mono shadow-2xl opacity-100 ring-1 ring-border"
                style={{
                  left: `${Math.min(Math.max((activePointCoords.x / width) * 100, 15), 85)}%`,
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="flex items-center justify-between gap-3 text-muted-foreground text-[11px]">
                  <span>{activePoint.formattedTime}</span>
                  <Badge
                    variant={
                      activePoint.hasChanges === 'YES'
                        ? 'warning'
                        : activePoint.hasChanges === 'INITIAL'
                          ? 'default'
                          : 'secondary'
                    }
                  >
                    {activePoint.hasChanges === 'YES'
                      ? 'Change'
                      : activePoint.hasChanges === 'INITIAL'
                        ? 'Initial'
                        : 'Unchanged'}
                  </Badge>
                </div>

                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-base font-semibold text-foreground">
                    {activePoint.displayValue}
                  </span>
                  {activePoint.deltaFromPrev !== null && activePoint.deltaFromPrev !== 0 && (
                    <span
                      className={`inline-flex items-center text-xs font-medium ${
                        activePoint.deltaFromPrev > 0 ? 'text-amber-500' : 'text-emerald-500'
                      }`}
                    >
                      {activePoint.deltaFromPrev > 0 ? (
                        <ArrowUpRight className="h-3 w-3 mr-0.5" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 mr-0.5" />
                      )}
                      {activePoint.deltaFromPrev > 0 ? '+' : ''}
                      {formatNumericValue(activePoint.deltaFromPrev)}
                      {activePoint.deltaPercentFromPrev !== null && (
                        <span className="opacity-80 ml-1">
                          ({activePoint.deltaPercentFromPrev > 0 ? '+' : ''}
                          {activePoint.deltaPercentFromPrev.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground border-t border-border/60 pt-1">
                  {activePoint.durationMs !== null && <span>{activePoint.durationMs}ms</span>}
                  {activePoint.httpStatus && <span>HTTP {activePoint.httpStatus}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="h-4 w-4" />
            Qualitative Monitor (Textual / Structural)
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            This monitor extracts non-numeric or unstructured data (e.g. headlines, paragraphs, or
            status strings). Discrete state transitions and detected content changes are recorded in
            the event log below.
          </p>
        </div>
      )}

      {/* Change Events Log Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
            Change Events Log ({changeRuns.length})
          </h4>
          <span className="text-xs font-mono text-muted-foreground">
            Displaying state changes & failures
          </span>
        </div>

        {changeRuns.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs font-mono text-muted-foreground text-center">
            No change events recorded yet. Target has maintained steady state.
          </div>
        ) : (
          <div className="space-y-2.5">
            {changeRuns.map((run) => {
              const isFailed = run.status === 'FAILED';
              const isInitial = run.hasChanges === 'INITIAL';

              return (
                <div
                  key={run.id}
                  className="rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-foreground/30"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={isFailed ? 'destructive' : isInitial ? 'default' : 'warning'}>
                        {isFailed ? 'FAILED' : isInitial ? 'BASELINE' : 'CHANGE DETECTED'}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatDateTime(run.executedAt, timeZone)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {run.screenshotUrl && (
                        <button
                          type="button"
                          onClick={() => onOpenScreenshot?.(run.screenshotUrl!)}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <Camera className="h-3 w-3 text-primary" />
                          Snapshot
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectRun?.(run)}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs font-mono text-primary hover:bg-muted cursor-pointer"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>

                  {run.extractedData && typeof run.extractedData === 'object' && (
                    <div className="mt-2 rounded border border-border/70 bg-muted/30 p-2 font-mono text-xs text-foreground max-h-36 overflow-auto">
                      <pre>{JSON.stringify(run.extractedData, null, 2)}</pre>
                    </div>
                  )}

                  {run.errorMessage && (
                    <div className="mt-2 text-xs font-mono text-red-500 bg-red-500/10 p-2 rounded border border-red-500/20">
                      {run.errorMessage}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
