'use client';

import * as React from 'react';
import {
  Calendar,
  Check,
  Cpu,
  Gauge,
  Globe,
  Layers,
  LogOut,
  Mail,
  Play,
  Save,
  Shield,
  User,
} from 'lucide-react';
import {
  formToProfileUpdate,
  isProfileFormDirty,
  resolveUserLanguage,
  resolveUserTimezone,
} from '@/forms/profileForm';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { PageLanguageSelect, describeLanguage } from '@/components/ui/PageLanguageSelect';
import { DEFAULT_PAGE_LANGUAGE, getBrowserPageLanguage } from '@/lib/pageLanguage';
import { TimezoneSelect } from '@/components/ui/TimezoneSelect';
import { useUpdateProfileMutation, useUserQuotasQuery } from '@/hooks/useDashboardQueries';
import { formatDateTime, getBrowserTimezone } from '@/lib/utils';
import type { UserDto } from '@/lib/api';
import { QuotaBar } from '@/components/dashboard/QuotaBar';

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserDto | null;
  onUserUpdated: (user: UserDto) => void;
  onLogout: () => void | Promise<void>;
  monitorsCount?: number;
}

export function ProfileModal({
  isOpen,
  onClose,
  user,
  onUserUpdated,
  onLogout,
  monitorsCount = 0,
}: ProfileModalProps) {
  const updateProfileMutation = useUpdateProfileMutation();
  const { data: quotas, isLoading: isLoadingQuotas } = useUserQuotasQuery(isOpen && Boolean(user));
  const browserPageLanguage = React.useMemo(
    () => getBrowserPageLanguage() ?? DEFAULT_PAGE_LANGUAGE,
    []
  );
  const browserTimezone = React.useMemo(() => getBrowserTimezone(), []);
  const defaults = React.useMemo(
    () => ({ language: browserPageLanguage, timezone: browserTimezone }),
    [browserPageLanguage, browserTimezone]
  );

  const [name, setName] = React.useState('');
  const [pageLanguage, setPageLanguage] = React.useState(browserPageLanguage);
  const [timezone, setTimezone] = React.useState(browserTimezone);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setPageLanguage(resolveUserLanguage(user, browserPageLanguage));
      setTimezone(resolveUserTimezone(user, browserTimezone));
      setErrorMessage(null);
      setSaveSuccess(false);
    }
  }, [user, isOpen, browserPageLanguage, browserTimezone]);

  if (!user) return null;

  const isSaving = updateProfileMutation.isPending;
  const effectiveTimezone = resolveUserTimezone(user, browserTimezone);
  const effectiveLanguage = resolveUserLanguage(user, browserPageLanguage);
  const formValues = { name, timezone, pageLanguage };
  const isDirty = isProfileFormDirty(formValues, user, defaults);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const updated = await updateProfileMutation.mutateAsync(
        formToProfileUpdate(formValues, user, defaults)
      );
      onUserUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  const formattedCreatedDate = formatDateTime(user.createdAt, effectiveTimezone);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      title="User Profile"
      description="Manage your account details and view system access status."
      maxWidthClass="max-w-xl sm:max-w-2xl"
    >
      <div className="space-y-6 py-1">
        <div className="flex items-center gap-4 rounded-xl border border-border/80 bg-muted/30 p-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card shadow-sm">
            <User className="h-7 w-7 text-foreground/80" />
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card bg-emerald-500" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-foreground">
                {user.name?.trim() || user.email.split('@')[0]}
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <Shield className="h-2.5 w-2.5" />
                Active
              </span>
            </div>
            <p className="truncate text-xs font-mono text-muted-foreground mt-0.5">{user.email}</p>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
            {errorMessage}
          </div>
        )}

        {saveSuccess && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            <span>Profile updated successfully.</span>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <FormField
            label="Display Name"
            htmlFor="profile-name"
            hint="Your public or team display name."
          >
            <Input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              disabled={isSaving}
            />
          </FormField>

          <FormField
            label="Scraper Language"
            htmlFor="profile-scraper-language"
            hint="Monitored websites are checked in this language. Sites that support multiple languages will display their content in this language."
          >
            <PageLanguageSelect
              id="profile-scraper-language"
              value={pageLanguage}
              onChange={setPageLanguage}
              disabled={isSaving}
            />
          </FormField>

          <FormField
            label="Preferred Timezone"
            htmlFor="profile-timezone"
            hint="Scheduled times, dates, check timestamps, and change histories use this timezone. Changing it updates your schedules."
          >
            <TimezoneSelect
              id="profile-timezone"
              value={timezone}
              onChange={(newTz) => setTimezone(newTz)}
              disabled={isSaving}
            />
          </FormField>

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              disabled={!isDirty || isSaving}
              className="h-9 px-4 text-xs font-medium"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>

        <div className="space-y-3.5 rounded-xl border border-border/80 bg-muted/20 p-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" />
              <span>Usage & Quotas</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Resets 1st of every month</span>
          </div>

          {isLoadingQuotas ? (
            <div className="space-y-3 py-1.5 animate-pulse">
              <div className="h-3.5 bg-muted/60 rounded w-1/3" />
              <div className="h-1.5 bg-muted/40 rounded w-full" />
              <div className="h-3.5 bg-muted/60 rounded w-1/3" />
              <div className="h-1.5 bg-muted/40 rounded w-full" />
            </div>
          ) : quotas ? (
            <div className="space-y-3.5 pt-0.5">
              <QuotaBar
                icon={Layers}
                label="Active Monitors"
                used={quotas.activeMonitors.used}
                limit={quotas.activeMonitors.limit}
                helper="Running, recovering, or pending monitors"
              />

              <QuotaBar
                icon={Cpu}
                label="Compilations"
                subLabel="(This Month)"
                used={quotas.monthlyCompilations.used}
                limit={quotas.monthlyCompilations.limit}
                helper="Initial monitor configurations and automatic recovery runs"
              />

              <QuotaBar
                icon={Play}
                label="Scrape Executions"
                subLabel="(This Month)"
                used={quotas.monthlyExecutions.used}
                limit={quotas.monthlyExecutions.limit}
                helper="Total scheduled and manual scrape runs"
              />
            </div>
          ) : (
            <div className="text-muted-foreground text-[11px]">
              Unable to load quota details at this time.
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4 text-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Account Specifications
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <div className="flex items-center justify-between py-1 border-b border-border/40">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>Email Address</span>
              </div>
              <span
                className="font-mono text-foreground truncate max-w-xs sm:max-w-sm"
                title={user.email}
              >
                {user.email}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-border/40">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                <span>Active Timezone</span>
              </div>
              <span className="font-mono text-foreground">{effectiveTimezone}</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-border/40">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                <span>Scraper Language</span>
              </div>
              <span className="font-mono text-foreground">
                {describeLanguage(effectiveLanguage).label}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-border/40">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                <span>Configured Monitors</span>
              </div>
              <span className="font-semibold text-foreground">
                {monitorsCount} {monitorsCount === 1 ? 'monitor' : 'monitors'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Member Since</span>
              </div>
              <span className="text-foreground">{formattedCreatedDate}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onClose();
              void onLogout();
            }}
            className="h-9 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            Sign out
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="h-9 px-4 text-xs font-medium"
          >
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
