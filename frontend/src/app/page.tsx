'use client';

import { AuthModal } from '@/components/auth/AuthModal';
import { ProfileModal } from '@/components/auth/ProfileModal';
import { UserAvatarMenu } from '@/components/auth/UserAvatarMenu';
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
import { useDashboardModals } from '@/hooks/useDashboardModals';
import {
  dashboardKeys,
  useCurrentUserQuery,
  useInvalidateDashboard,
  useJobsQuery,
  useLogoutMutation,
  useStatsQuery,
} from '@/hooks/useDashboardQueries';
import { useRealtimeEvents, type RealtimeEventPayload } from '@/hooks/useRealtimeEvents';
import { api, type UserDto } from '@/lib/api';
import { Plus, Radio } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

export default function DashboardPage() {
  const { data: user = null } = useCurrentUserQuery();
  const {
    data: jobs = [],
    isLoading: isJobsLoading,
    isFetching: isJobsFetching,
    error: jobsError,
    refetch: refetchJobs,
  } = useJobsQuery();
  const {
    data: stats = null,
    isFetching: isStatsFetching,
    error: statsError,
    refetch: refetchStats,
  } = useStatsQuery();

  const { queryClient, invalidateJobsAndStats, invalidateAll } = useInvalidateDashboard();
  const logoutMutation = useLogoutMutation();

  const modals = useDashboardModals();

  const isRefreshing = isJobsLoading || isJobsFetching || isStatsFetching;
  const connectionError = jobsError || statsError;
  const [runningJobIds, setRunningJobIds] = React.useState<Set<string>>(() => new Set());
  const runningTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  React.useEffect(() => () => {
    for (const timer of runningTimers.current.values()) clearTimeout(timer);
    runningTimers.current.clear();
  }, []);

  // Real-time server-sent events with auto-invalidation
  const { connectionMode } = useRealtimeEvents({
    enabled: Boolean(user),
    onJobEvent: React.useCallback((event: RealtimeEventPayload) => {
      if (event.type === 'JOB_UPDATED' && event.status === 'RUNNING') {
        const old = runningTimers.current.get(event.jobId);
        if (old) clearTimeout(old);
        setRunningJobIds((current) => new Set(current).add(event.jobId));
        runningTimers.current.set(event.jobId, setTimeout(() => {
          runningTimers.current.delete(event.jobId);
          setRunningJobIds((current) => { const next = new Set(current); next.delete(event.jobId); return next; });
          void invalidateJobsAndStats();
        }, 120_000));
      } else if (event.jobId) {
        const old = runningTimers.current.get(event.jobId);
        if (old) clearTimeout(old);
        runningTimers.current.delete(event.jobId);
        setRunningJobIds((current) => { const next = new Set(current); next.delete(event.jobId); return next; });
      }
      void invalidateJobsAndStats();
    }, [invalidateJobsAndStats]),
    onReconnect: React.useCallback(() => {
      for (const timer of runningTimers.current.values()) clearTimeout(timer);
      runningTimers.current.clear();
      setRunningJobIds(new Set());
      void invalidateJobsAndStats();
    }, [invalidateJobsAndStats]),
  });

  // Automatically submit pending draft if user just signed in
  React.useEffect(() => {
    if (user && typeof window !== 'undefined') {
      const rawPending = sessionStorage.getItem(PENDING_JOB_STORAGE_KEY);
      if (rawPending) {
        sessionStorage.removeItem(PENDING_JOB_STORAGE_KEY);
        try {
          const draft = JSON.parse(rawPending) as {
            name?: string;
            url: string;
            userPrompt: string;
            notificationEmail?: string;
            cronExpression: string;
          };
          void (async () => {
            await api.createJob({
              name: draft.name,
              url: draft.url,
              userPrompt: draft.userPrompt,
              notificationEmail: draft.notificationEmail || user.email,
              cronExpression: draft.cronExpression,
            });
            await invalidateJobsAndStats();
          })();
        } catch {
          // Ignore malformed pending draft
        }
      }
    }
  }, [user, invalidateJobsAndStats]);

  const handleRefresh = React.useCallback(async () => {
    await Promise.all([refetchJobs(), refetchStats()]);
  }, [refetchJobs, refetchStats]);

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      modals.closeAll();
    } catch {
      // Ignore logout error
    }
  };

  const handleUserAuthenticated = (loggedUser: UserDto) => {
    queryClient.setQueryData(dashboardKeys.user, loggedUser);
    void invalidateAll();
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
              onClick={modals.openIntegrationsModal}
              className="h-9 px-2.5 sm:px-3 text-xs sm:text-sm font-medium"
              title="Configure Telegram and Webhook integrations"
            >
              <Radio className="h-4 w-4 sm:mr-1.5 text-primary" />
              <span className="hidden sm:inline">Integrations</span>
            </Button>
            <Button
              onClick={modals.openCreateModal}
              className="h-9 px-3.5 sm:px-4 text-xs sm:text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              <span>New Monitor</span>
            </Button>
            {user ? (
              <UserAvatarMenu
                user={user}
                onOpenProfile={modals.openProfileModal}
                onOpenIntegrations={modals.openIntegrationsModal}
                onLogout={handleLogout}
              />
            ) : (
              <Button
                variant="outline"
                onClick={modals.openAuthModal}
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

        {connectionError && (
          <div className="rounded-md border border-border bg-muted/60 px-4 py-3 text-xs sm:text-sm text-foreground flex items-center justify-between">
            <span>
              Unable to connect to the backend service. Please verify that the API is running.
            </span>
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
            runningJobIds={runningJobIds}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onSelectJobForHistory={modals.openJobHistory}
          onEditJob={modals.openEditJob}
          onCreateClick={modals.openCreateModal}
          timeZone={user?.timezone || 'America/Sao_Paulo'}
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
        isOpen={modals.isCreateModalOpen}
        user={user}
        onAuthenticated={handleUserAuthenticated}
        onClose={modals.closeCreateModal}
        onCreated={() => void invalidateJobsAndStats()}
      />

      {/* Standalone Auth Modal */}
      <AuthModal
        isOpen={modals.isAuthModalOpen}
        onClose={modals.closeAuthModal}
        onAuthenticated={handleUserAuthenticated}
      />

      {/* User Profile Modal */}
      <ProfileModal
        isOpen={modals.isProfileModalOpen}
        onClose={modals.closeProfileModal}
        user={user}
        onUserUpdated={handleUserAuthenticated}
        onLogout={handleLogout}
        monitorsCount={jobs.length}
      />

      {/* Edit Modal */}
      <EditJobModal
        job={modals.editingJob}
        isOpen={Boolean(modals.editingJob)}
        user={user}
        onClose={modals.closeEditJob}
        onUpdated={() => void invalidateJobsAndStats()}
      />

      {/* Snapshot and Diff Drawer */}
      <JobRunsDrawer
        job={modals.selectedJob}
        onClose={modals.closeJobHistory}
        timeZone={user?.timezone || 'America/Sao_Paulo'}
      />

      <IntegrationsModal
        isOpen={modals.isIntegrationsModalOpen}
        onClose={modals.closeIntegrationsModal}
        timeZone={user?.timezone || 'America/Sao_Paulo'}
      />
    </div>
  );
}
