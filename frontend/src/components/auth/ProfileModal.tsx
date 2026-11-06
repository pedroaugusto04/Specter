'use client';

import * as React from 'react';
import { Calendar, Check, Globe, Layers, LogOut, Mail, Save, Shield, User } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { useUpdateProfileMutation } from '@/hooks/useDashboardQueries';
import { COMMON_TIMEZONES, DEFAULT_TIMEZONE } from '@/lib/utils';
import type { UserDto } from '@/lib/api';

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
  const [name, setName] = React.useState('');
  const [timezone, setTimezone] = React.useState(DEFAULT_TIMEZONE);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      setName(user.name || '');
      setTimezone(user.timezone || DEFAULT_TIMEZONE);
      setErrorMessage(null);
      setSaveSuccess(false);
    }
  }, [user, isOpen]);

  if (!user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const updated = await updateProfileMutation.mutateAsync({
        name: name.trim() || null,
        timezone,
      });
      onUserUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const formattedCreatedDate = (() => {
    try {
      const d = new Date(user.createdAt);
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: user.timezone || DEFAULT_TIMEZONE,
      }).format(d);
    } catch {
      return user.createdAt;
    }
  })();

  const isDirty =
    (user.name || '') !== name.trim() || (user.timezone || DEFAULT_TIMEZONE) !== timezone;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="User Profile"
      description="Manage your account details and view system access status."
      maxWidthClass="max-w-md sm:max-w-lg"
    >
      <div className="space-y-6 py-1">
        {/* Profile Card Header */}
        <div className="flex items-center gap-4 rounded-xl border border-border/80 bg-muted/30 p-4">
          {/* Default User Logo / Avatar */}
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

        {/* Edit Profile Form */}
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
            label="Preferred Timezone"
            htmlFor="profile-timezone"
            hint="Scheduled times, dates, check timestamps, and change histories use this timezone. Changing it updates your schedules."
          >
            <select
              id="profile-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={isSaving}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value} className="bg-background text-foreground">
                  {tz.label}
                </option>
              ))}
            </select>
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

        {/* Account Details Overview */}
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4 text-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Account Specifications
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {/* Email */}
            <div className="flex items-center justify-between py-1 border-b border-border/40">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>Email Address</span>
              </div>
              <span className="font-mono text-foreground truncate max-w-[200px]" title={user.email}>
                {user.email}
              </span>
            </div>

            {/* Timezone */}
            <div className="flex items-center justify-between py-1 border-b border-border/40">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                <span>Active Timezone</span>
              </div>
              <span className="font-mono text-foreground">{user.timezone || DEFAULT_TIMEZONE}</span>
            </div>

            {/* Monitors count */}
            <div className="flex items-center justify-between py-1 border-b border-border/40">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                <span>Configured Monitors</span>
              </div>
              <span className="font-semibold text-foreground">
                {monitorsCount} {monitorsCount === 1 ? 'monitor' : 'monitors'}
              </span>
            </div>

            {/* Member Since */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Member Since</span>
              </div>
              <span className="text-foreground">{formattedCreatedDate}</span>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
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
