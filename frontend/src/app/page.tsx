'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Radio } from 'lucide-react';
import { ProfileModal } from '@/components/auth/ProfileModal';
import { UserAvatarMenu } from '@/components/auth/UserAvatarMenu';
import { AuthModal } from '@/components/auth/AuthModal';
import { SpecterLogo } from '@/components/brand/SpecterLogo';
import { PENDING_JOB_STORAGE_KEY } from '@/components/dashboard/CreateJobForm';
import { CreateJobModal } from '@/components/dashboard/CreateJobModal';
import { EditJobModal } from '@/components/dashboard/EditJobModal';
import { IntegrationsModal } from '@/components/dashboard/IntegrationsModal';
import { JobRunsDrawer } from '@/components/dashboard/JobRunsDrawer';
import { JobsTable } from '@/components/dashboard/JobsTable';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { ThemeToggle } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { api, type DashboardStats, type ScrapingJobDto, type UserDto } from '@/lib/api';

export default function DashboardPage() {
  const [user, setUser] = React.useState<UserDto | null>(null);
  const [jobs, setJobs] = React.useState<ScrapingJobDto[]>([]);
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [selectedJob, setSelectedJob] = React.useState<ScrapingJobDto | null>(null);
  const [editingJob, setEditingJob] = React.useState<ScrapingJobDto | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = React.useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);
  const [isIntegrationsModalOpen, setIsIntegrationsModalOpen] = React.useState(false);
  const [connectionWarning, setConnectionWarning] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const refreshJobsAndStats = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [jobsData, statsData] = await Promise.all([
        api.listJobs(),
        api.getStats(),
      ]);
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

  const loadDashboard = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [meData, jobsData, statsData] = await Promise.all([
        api.getMe(),
        api.listJobs(),
        api.getStats(),
      ]);
      setUser(meData);
      setJobs(jobsData);
      setStats(statsData);
      setConnectionWarning(null);

      if (meData && typeof window !== 'undefined') {
        const rawPending = sessionStorage.getItem(PENDING_JOB_STORAGE_KEY);
        if (rawPending) {
          sessionStorage.removeItem(PENDING_JOB_STORAGE_KEY);
          try {
            const draft = JSON.parse(rawPending) as {
              url: string;
              userPrompt: string;
              notificationEmail?: string;
              cronExpression: string;
            };
            await api.createJob({
              url: draft.url,
              userPrompt: draft.userPrompt,
              notificationEmail: draft.notificationEmail || meData.email,
              cronExpression: draft.cronExpression,
            });
            await refreshJobsAndStats();
          } catch {
            // ignore malformed pending draft
          }
        }
      }
    } catch {
      setConnectionWarning(
        'Unable to connect to the backend service. Please verify that the API is running.'
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshJobsAndStats]);

  // Connect to SSE stream for zero-latency push invalidations with smart polling fallback
  const { connectionMode } = useRealtimeEvents({
    enabled: true,
    onJobEvent: React.useCallback(() => {
      void refreshJobsAndStats();
    }, [refreshJobsAndStats]),
    onReconnect: React.useCallback(() => {
      void refreshJobsAndStats();
    }, [refreshJobsAndStats]),
  });

  React.useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleLogout = async () => {
    try {
      await api.logout();
      setUser(null);
      setSelectedJob(null);
      setEditingJob(null);
      await loadDashboard();
    } catch {
      // ignore logout error
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Minimalist Top Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <SpecterLogo size="md" />
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsIntegrationsModalOpen(true)}
              className="h-9 px-2.5 sm:px-3 text-xs sm:text-sm font-medium"
              title="Configure Telegram and Webhook integrations"
            >
              <Radio className="h-4 w-4 sm:mr-1.5 text-primary" />
              <span className="hidden sm:inline">Integrations</span>
            </Button>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="h-9 px-3.5 sm:px-4 text-xs sm:text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              <span>New Monitor</span>
            </Button>
            {user ? (
              <UserAvatarMenu
                user={user}
                onOpenProfile={() => setIsProfileModalOpen(true)}
                onOpenIntegrations={() => setIsIntegrationsModalOpen(true)}
                onLogout={handleLogout}
              />
            ) : (
              <Button
                variant="outline"
                onClick={() => setIsAuthModalOpen(true)}
                className="h-9 px-3.5 text-xs sm:text-sm font-medium"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 mx-auto w-full max-w-7xl space-y-6 sm:space-y-8 px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Monitors
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Scheduled web extraction and structured diff tracking.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            {connectionMode === 'connecting' && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40 animate-pulse" />
                <span>Connecting...</span>
              </span>
            )}
            {connectionMode === 'disconnected' && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" />
                <span>Offline</span>
              </span>
            )}
          </div>
        </div>

        {connectionWarning && (
          <div className="rounded-md border border-border bg-muted/60 px-4 py-3 text-xs sm:text-sm text-foreground flex items-center justify-between">
            <span>{connectionWarning}</span>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
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
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8 text-xs text-muted-foreground">
          <span className="font-mono">Specter Web Monitor &copy; 2026</span>
          <div className="flex items-center gap-4 text-xs font-normal">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <span>&bull;</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>

      {/* Creation Modal */}
      <CreateJobModal
        isOpen={isCreateModalOpen}
        user={user}
        onAuthenticated={(loggedUser) => setUser(loggedUser)}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={loadDashboard}
      />

      {/* Standalone Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthenticated={(loggedUser) => {
          setUser(loggedUser);
          void loadDashboard();
        }}
      />

      {/* User Profile Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={user}
        onUserUpdated={(updated) => setUser(updated)}
        onLogout={handleLogout}
        monitorsCount={jobs.length}
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
      <IntegrationsModal
        isOpen={isIntegrationsModalOpen}
        onClose={() => setIsIntegrationsModalOpen(false)}
      />
    </div>
  );
}
