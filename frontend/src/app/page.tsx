'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { SpecterLogo } from '@/components/brand/SpecterLogo';
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
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-zinc-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <SpecterLogo size="md" />
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-white/[0.08]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-mono text-zinc-400 tracking-wide uppercase">
                Radar Active
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              size="sm"
              className="flex items-center gap-1.5 shadow-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-3.5 h-8 rounded-lg"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Monitor</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {connectionWarning && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 px-4 py-3 text-xs text-amber-300 backdrop-blur-sm">
            {connectionWarning}
          </div>
        )}

        {/* High-Density KPI Cards */}
        <StatsCards stats={stats} />

        {/* Central Fleet Monitoring Console */}
        <JobsTable
          jobs={jobs}
          onRefresh={loadDashboard}
          isRefreshing={isRefreshing}
          onSelectJobForHistory={(job) => setSelectedJob(job)}
          onEditJob={(job) => setEditingJob(job)}
          onCreateClick={() => setIsCreateModalOpen(true)}
        />
      </main>

      {/* Creation Modal */}
      <CreateJobModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={loadDashboard}
      />

      {/* Edit Modal */}
      <EditJobModal
        job={editingJob}
        isOpen={Boolean(editingJob)}
        onClose={() => setEditingJob(null)}
        onUpdated={loadDashboard}
      />

      {/* Snapshot and Diff Drawer */}
      <JobRunsDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}
