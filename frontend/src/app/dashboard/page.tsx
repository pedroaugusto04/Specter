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
import { PAGINATION_DEFAULT_PAGE_SIZE, type JobStatus } from '@specter/contracts';
import { getBrowserTimezone } from '@/lib/utils';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { Plus, Radio } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

export default function DashboardPage() {
  const [jobsPage, setJobsPage] = React.useState(1);
  const [jobsPageSize, setJobsPageSize] = React.useState<number>(PAGINATION_DEFAULT_PAGE_SIZE);
  const [jobsStatus, setJobsStatus] = React.useState<
    JobStatus | 'recovering' | 'paused' | undefined
  >();
  const [jobsSearch, setJobsSearch] = React.useState('');
  const { data: user = null, error: userError, refetch: refetchUser } = useCurrentUserQuery();
  const {
    data: jobsResult,
    isLoading: isJobsLoading,
    isFetching: isJobsFetching,
    error: jobsError,
    refetch: refetchJobs,
  } = useJobsQuery(jobsPage, jobsPageSize, jobsStatus, jobsSearch);
  const jobs = jobsResult?.items ?? [];
  const {
    data: stats = null,
    isFetching: isStatsFetching,
    error: statsError,
    refetch: refetchStats,
  } = useStatsQuery();

  const { queryClient, invalidateJobsAndStats, invalidateAll } = useInvalidateDashboard();
  const logoutMutation = useLogoutMutation();

  const modals = useDashboardModals();

  const effectiveTimeZone = user?.timezone || getBrowserTimezone();

  const selectedJob = React.useMemo(() => {
    const current = modals.selectedJob;
    if (!current) return null;
    return jobs.find((j) => j.id === current.id) ?? current;
  }, [jobs, modals.selectedJob]);

  const editingJob = React.useMemo(() => {
    const current = modals.editingJob;
    if (!current) return null;
    return jobs.find((j) => j.id === current.id) ?? current;
  }, [jobs, modals.editingJob]);

  const isRefreshing = isJobsLoading || isJobsFetching || isStatsFetching;
  const connectionError = userError || jobsError || statsError;
  const runningJobIds = React.useMemo(
    () => new Set(jobs.filter((job) => job.currentRun).map((job) => job.id)),
    [jobs]
  );

  const { toasts, addToast, removeToast } = useToast();

  const { connectionMode } = useRealtimeEvents({
    enabled: Boolean(user),
    onJobEvent: React.useCallback(
      (event: RealtimeEventPayload) => {
        void invalidateJobsAndStats(event.jobId);
        if (event.type === 'JOB_COMPILATION_FAILED' && event.fallbackToPrevious) {
          const targetJob = jobs.find((j) => j.id === event.jobId);
          const jobName = targetJob?.name || 'Monitor';
          addToast({
            type: 'warning',
            title: 'Recompilation Notice',
            message: `Recompilation failed for "${jobName}". Monitor remains active using previous stable selectors.`,
          });
        }
      },
      [invalidateJobsAndStats, jobs, addToast]
    ),
    onReconnect: React.useCallback(() => {
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

  // Automatically open job drawer if redirected via email alert with ?jobId=...
  React.useEffect(() => {
    if (typeof window === 'undefined' || !jobs.length || modals.selectedJob) return;
    const params = new URLSearchParams(window.location.search);
    const targetJobId = params.get('jobId');
    if (!targetJobId) return;

    const matched = jobs.find((j) => j.id === targetJobId);
    if (matched) {
      modals.openJobHistory(matched);
    }
  }, [jobs, modals.selectedJob, modals.openJobHistory]);

  const handleRefresh = React.useCallback(async () => {
    await Promise.all([refetchUser(), refetchJobs(), refetchStats()]);
  }, [refetchUser, refetchJobs, refetchStats]);

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
            <Link href="/" className="flex items-center gap-2 group">
              <SpecterLogo size="md" />
            </Link>
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
          timeZone={effectiveTimeZone}
          pagination={jobsResult?.pagination}
          page={jobsPage}
          pageSize={jobsPageSize}
          onPageChange={setJobsPage}
          onPageSizeChange={(value) => {
            setJobsPageSize(value);
            setJobsPage(1);
          }}
          onSearchChange={(value) => {
            setJobsSearch(value);
            setJobsPage(1);
          }}
          onStatusChange={(value) => {
            setJobsStatus(value);
            setJobsPage(1);
          }}
        />
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8 text-xs text-muted-foreground">
          <span className="font-mono">Specter Web Monitor &copy; 2026</span>
          <div className="flex items-center gap-4 text-xs font-normal">
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <span>&bull;</span>
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
        job={editingJob}
        isOpen={Boolean(editingJob)}
        user={user}
        onClose={modals.closeEditJob}
        onUpdated={() => void invalidateJobsAndStats()}
      />

      {/* Snapshot and Diff Drawer */}
      <JobRunsDrawer
        job={selectedJob}
        onClose={modals.closeJobHistory}
        timeZone={effectiveTimeZone}
      />

      <IntegrationsModal
        isOpen={modals.isIntegrationsModalOpen}
        onClose={modals.closeIntegrationsModal}
        timeZone={effectiveTimeZone}
      />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
