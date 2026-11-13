'use client';

import * as React from 'react';

export interface QuotaBarProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  subLabel?: string;
  used: number;
  limit: number;
  helper?: string;
}

export function QuotaBar({ icon: Icon, label, subLabel, used, limit, helper }: QuotaBarProps) {
  const percentage = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const isAtLimit = used >= limit;
  const isNearLimit = percentage >= 80 && !isAtLimit;

  const barColor = isAtLimit ? 'bg-destructive' : isNearLimit ? 'bg-amber-500' : 'bg-primary';

  const badgeColor = isAtLimit
    ? 'text-destructive font-semibold'
    : isNearLimit
      ? 'text-amber-500 font-semibold'
      : 'text-foreground';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{label}</span>
          {subLabel && (
            <span className="text-[11px] font-normal text-muted-foreground">{subLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className={badgeColor}>{used.toLocaleString()}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{limit.toLocaleString()}</span>
          <span className="text-[10px] text-muted-foreground">({percentage}%)</span>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60 dark:bg-muted/40">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {helper && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{helper}</span>
          {isAtLimit && <span className="font-medium text-destructive">Quota reached</span>}
        </div>
      )}
    </div>
  );
}
