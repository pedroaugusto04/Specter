'use client';

import { Activity, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { DashboardStats } from '@/lib/api';

export function StatsCards({ stats }: { stats: DashboardStats | null }) {
  const items = [
    {
      label: 'Monitors',
      value: stats?.totalJobs ?? 0,
      sub: `${stats?.totalRuns ?? 0} runs executed`,
      icon: Activity,
      color: 'text-slate-700 bg-slate-100',
    },
    {
      label: 'Active',
      value: stats?.activeJobs ?? 0,
      sub: 'Continuous schedule',
      icon: CheckCircle2,
      color: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Healing',
      value: stats?.healingOrCompilingJobs ?? 0,
      sub: 'Selector updates',
      icon: Sparkles,
      color: 'text-amber-700 bg-amber-50',
    },
    {
      label: 'Diff Alerts',
      value: stats?.DetectedChangesCount ?? 0,
      sub: `${stats?.failedOrPausedJobs ?? 0} paused / failed`,
      icon: AlertTriangle,
      color: 'text-indigo-700 bg-indigo-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.sub}</p>
                </div>
                <div className={`rounded-lg p-2.5 ${item.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
