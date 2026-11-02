'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { CreateJobForm } from '@/components/dashboard/CreateJobForm';
import { CreateJobModal } from '@/components/dashboard/CreateJobModal';
import { EditJobModal } from '@/components/dashboard/EditJobModal';
import { JobRunsDrawer } from '@/components/dashboard/JobRunsDrawer';
import { JobsTable } from '@/components/dashboard/JobsTable';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { Button } from '@/components/ui/button';
import { api, type DashboardStats, type ScrapingJobDto } from '@/lib/api';

export default function DashboardPage() {
  const [jobs, setJobs] = React.useState<ScrapingJobDto[]>([]);
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [selectedJob, setSelectedJob] = React.useState<ScrapingJobDto | null>(null);
  const [editingJob, setEditingJob] = React.useState<ScrapingJobDto | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [connectionWarning, setConnectionWarning] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadDashboard = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [jobsData, statsData] = await Promise.all([api.listJobs(), api.getStats()]);
      setJobs(jobsData);
      setStats(statsData);
      setConnectionWarning(null);
    } catch {
      setConnectionWarning(
        'Unable to connect to the backend service. Please verify that the API is running.'
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDashboard();
    const timer = setInterval(() => {
      void loadDashboard();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm ring-1 ring-slate-800">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="url(#specter-grad)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="#818CF8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="#06B6D4"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <defs>
                  <linearGradient id="specter-grad" x1="2" y1="2" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366F1" />
                    <stop offset="1" stopColor="#06B6D4" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-base font-semibold tracking-tight text-slate-950">
                Specter
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-slate-600 border border-slate-200">
                v1.0
              </span>
              <div className="hidden sm:flex items-center gap-1.5 pl-2 text-xs text-slate-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </span>
                <span>Live</span>
              </div>
            </div>
          </div>

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            size="sm"
            className="flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>New Monitor</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {connectionWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            {connectionWarning}
          </div>
        )}

        <StatsCards stats={stats} />

        <CreateJobForm onCreated={loadDashboard} />

        <JobsTable
          jobs={jobs}
          onRefresh={loadDashboard}
          isRefreshing={isRefreshing}
          onSelectJobForHistory={(job) => setSelectedJob(job)}
          onEditJob={(job) => setEditingJob(job)}
        />
      </main>

      <CreateJobModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={loadDashboard}
      />

      <EditJobModal
        job={editingJob}
        isOpen={Boolean(editingJob)}
        onClose={() => setEditingJob(null)}
        onUpdated={loadDashboard}
      />

      <JobRunsDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}
