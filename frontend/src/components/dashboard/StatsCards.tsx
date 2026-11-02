'use client';

import { Activity, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import type { DashboardStats } from '@/lib/api';

export function StatsCards({ stats }: { stats: DashboardStats | null }) {
  const items = [
    {
      label: 'Total Monitors',
      value: stats?.totalJobs ?? 0,
      sub: `${stats?.totalRuns ?? 0} runs executed`,
      icon: Activity,
      glow: 'bg-zinc-400',
      iconColor: 'text-zinc-300',
    },
    {
      label: 'Active & Polling',
      value: stats?.activeJobs ?? 0,
      sub: 'Continuous schedule',
      icon: CheckCircle2,
      glow: 'bg-emerald-400',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Self-Healing / AI',
      value: stats?.healingOrCompilingJobs ?? 0,
      sub: 'Selector updates',
      icon: Sparkles,
      glow: 'bg-amber-400',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Diff Alerts Triggered',
      value: stats?.DetectedChangesCount ?? 0,
      sub: `${stats?.failedOrPausedJobs ?? 0} paused / failed`,
      icon: AlertTriangle,
      glow: 'bg-cyan-400',
      iconColor: 'text-cyan-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="group relative rounded-xl border border-white/[0.07] bg-zinc-900/40 p-4 backdrop-blur-sm transition-all duration-200 hover:border-white/15 hover:bg-zinc-900/60"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                {item.label}
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${item.glow} opacity-75 group-hover:opacity-100 transition-opacity`} />
                <Icon className={`h-4 w-4 ${item.iconColor}`} />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold tracking-tight text-zinc-100">
                {item.value}
              </span>
            </div>

            <p className="mt-1 text-xs text-zinc-500 truncate">{item.sub}</p>
          </div>
        );
      })}
    </div>
  );
}
