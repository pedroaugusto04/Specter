'use client';

import { Activity, Bell, CheckCircle2, Terminal } from 'lucide-react';
import type { DashboardStats } from '@/lib/api';

export function StatsCards({ stats }: { stats: DashboardStats | null }) {
  const items = [
    {
      label: 'Total Monitors',
      value: stats?.totalJobs ?? 0,
      sub: `${stats?.totalRuns ?? 0} total executions`,
      icon: Activity,
    },
    {
      label: 'Active Schedule',
      value: stats?.activeJobs ?? 0,
      sub: 'Polling on cron interval',
      icon: CheckCircle2,
    },
    {
      label: 'Schema Sync',
      value: stats?.recoveringOrCompilingJobs ?? 0,
      sub: 'Compiling or recovering selectors',
      icon: Terminal,
    },
    {
      label: 'Detected Changes',
      value: stats?.DetectedChangesCount ?? 0,
      sub: `${stats?.failedOrPausedJobs ?? 0} paused or failed`,
      icon: Bell,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-lg border border-border bg-border overflow-hidden">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="bg-card p-5 sm:p-6 transition-colors hover:bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
                {item.label}
              </span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="mt-3 flex items-baseline">
              <span className="font-mono text-3xl font-semibold tracking-tight text-foreground">
                {item.value}
              </span>
            </div>

            <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground truncate">{item.sub}</p>
          </div>
        );
      })}
    </div>
  );
}
