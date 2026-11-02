'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { SpecterLogo } from '@/components/brand/SpecterLogo';
import { CreateJobModal } from '@/components/dashboard/CreateJobModal';
import { EditJobModal } from '@/components/dashboard/EditJobModal';
import { JobRunsDrawer } from '@/components/dashboard/JobRunsDrawer';
import { JobsTable } from '@/components/dashboard/JobsTable';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { ThemeToggle } from '@/components/theme/ThemeProvider';
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
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Minimalist Top Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <SpecterLogo size="md" />
            <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-border">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-foreground" />
              <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                System Online
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              size="sm"
              className="h-8 px-3 text-xs font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Monitor</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Monitors
            </h1>
            <p className="text-xs text-muted-foreground">
              Scheduled web extraction and structured diff tracking.
            </p>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            Auto-sync: 10s interval
          </div>
        </div>

        {connectionWarning && (
          <div className="rounded-md border border-border bg-muted/60 px-4 py-3 text-xs text-foreground flex items-center justify-between">
            <span>{connectionWarning}</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Offline
            </span>
          </div>
        )}

        {/* Architectural Metric Strip */}
        <StatsCards stats={stats} />

        {/* Central Monitoring Table */}
        <JobsTable
          jobs={jobs}
          onRefresh={loadDashboard}
          isRefreshing={isRefreshing}
          onSelectJobForHistory={(job) => setSelectedJob(job)}
          onEditJob={(job) => setEditingJob(job)}
          onCreateClick={() => setIsCreateModalOpen(true)}
        />
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8 text-[11px] font-mono text-muted-foreground">
          <span>Specter Web Monitor</span>
          <span>v1.0</span>
        </div>
      </footer>

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
