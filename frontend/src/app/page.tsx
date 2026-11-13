'use client';

import { AuthModal } from '@/components/auth/AuthModal';
import { ProfileModal } from '@/components/auth/ProfileModal';
import { UserAvatarMenu } from '@/components/auth/UserAvatarMenu';
import { SpecterLogo } from '@/components/brand/SpecterLogo';
import { CreateJobModal } from '@/components/dashboard/CreateJobModal';
import { LandingSection } from '@/components/marketing/LandingSection';
import { ThemeToggle } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { useDashboardModals } from '@/hooks/useDashboardModals';
import {
  dashboardKeys,
  useCurrentUserQuery,
  useInvalidateDashboard,
  useLogoutMutation,
} from '@/hooks/useDashboardQueries';
import type { UserDto } from '@/lib/api';
import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export default function HomePage() {
  const { data: user = null } = useCurrentUserQuery();
  const { queryClient, invalidateAll } = useInvalidateDashboard();
  const logoutMutation = useLogoutMutation();
  const modals = useDashboardModals();
  const router = useRouter();

  // If URL has ?jobId=... from email alert, redirect to /dashboard?jobId=...
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const targetJobId = params.get('jobId');
    if (targetJobId) {
      router.push(`/dashboard?jobId=${encodeURIComponent(targetJobId)}`);
    }
  }, [router]);

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

  const handleJobCreated = () => {
    modals.closeCreateModal();
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Bar with Brand and Navigation */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <SpecterLogo size="md" />
            </Link>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />

            {user ? (
              <>
                <Link href="/dashboard">
                  <Button
                    size="sm"
                    className="h-9 px-3.5 sm:px-4 text-xs sm:text-sm font-medium gap-1.5"
                  >
                    <span>Dashboard</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
                <UserAvatarMenu
                  user={user}
                  onOpenProfile={modals.openProfileModal}
                  onLogout={handleLogout}
                />
              </>
            ) : (
              <>
                <Button
                  onClick={modals.openCreateModal}
                  className="h-9 px-3.5 sm:px-4 text-xs sm:text-sm font-medium gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Monitor</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={modals.openAuthModal}
                  className="h-9 px-3.5 text-xs sm:text-sm font-medium"
                >
                  Sign In
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Landing Workspace */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <LandingSection
          user={user}
          onGetStarted={modals.openAuthModal}
          onOpenCreate={modals.openCreateModal}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8 text-xs text-muted-foreground">
          <span className="font-mono">Specter Web Monitor &copy; 2026</span>
          <div className="flex items-center gap-4 text-xs font-normal">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">
              Dashboard
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
        onCreated={handleJobCreated}
      />

      {/* Auth Modal */}
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
        monitorsCount={0}
      />
    </div>
  );
}
