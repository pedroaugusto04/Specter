'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { SpecterLogo } from '@/components/brand/SpecterLogo';
import { CreateJobModal } from '@/components/dashboard/CreateJobModal';
import { EditJobModal } from '@/components/dashboard/EditJobModal';
import { JobRunsDrawer } from '@/components/dashboard/JobRunsDrawer';
import { JobsTable } from '@/components/dashboard/JobsTable';
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
      {/* Utilitarian Navigation Bar */}
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <SpecterLogo size="md" />

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            size="sm"
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Monitor</span>
          </Button>
        </div>
      </header>

      {/* Main Console Workspace */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {connectionWarning && (
          <div className="mb-4 rounded-md border border-amber-900/60 bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-300">
            {connectionWarning}
          </div>
        )}

        <JobsTable
          jobs={jobs}
          stats={stats}
          onRefresh={loadDashboard}
          isRefreshing={isRefreshing}
          onSelectJobForHistory={(job) => setSelectedJob(job)}
          onEditJob={(job) => setEditingJob(job)}
          onCreateClick={() => setIsCreateModalOpen(true)}
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
