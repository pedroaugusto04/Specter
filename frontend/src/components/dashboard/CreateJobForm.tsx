'use client';
import { emptyJobForm, formToCreateJob } from '@/forms/jobForm';
import { useJobForm } from '@/hooks/useJobForm';
import { JobScheduleFields } from './JobScheduleFields';
import { TriggerHelpCallout } from './TriggerRulesEditor';
import { getBrowserTimezone } from '@/lib/utils';

import { AuthForm } from '@/components/auth/AuthForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import {
  useCheckSessionMutation,
  useCreateJobMutation,
  useProbeUrlMutation,
  useJobsQuery,
} from '@/hooks/useDashboardQueries';
import { ApiError, type SessionDto, type UserDto } from '@/lib/api';
import { validateJobForm, validateUrl, type JobFormField } from '@/lib/validation';
import { CheckCircle2, HelpCircle, Loader2, Plus, ShieldCheck } from 'lucide-react';
import * as React from 'react';

export const PENDING_JOB_STORAGE_KEY = 'specter_pending_job';

export interface CreateJobFormProps {
  user?: UserDto | null;
  onAuthenticated?: (user: UserDto) => void;
  onStepChange?: (step: 'form' | 'auth') => void;
  onCreated: () => void;
  onCancel?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  isModal?: boolean;
}

export function CreateJobForm({
  user,
  onAuthenticated,
  onStepChange,
  onCreated,
  onCancel,
  onDirtyChange,
  isModal = false,
}: CreateJobFormProps) {
  const {
    values,
    reset: resetForm,
    setUrl,
    setName,
    setUserPrompt,
    setSendEmailAlerts,
    setNotificationEmail,
    setShowCustomWebhook,
    setWebhookUrl,
    setWebhookSecret,
    setCaptureScreenshotOnChange,
  } = useJobForm();
  const {
    url,
    name,
    userPrompt,
    sendEmailAlerts,
    notificationEmail,
    showCustomWebhook,
    webhookUrl,
    webhookSecret,
    captureScreenshotOnChange,
    cronPreset,
    customCron,
    useCustomCron,
  } = values;
  const [step, setStep] = React.useState<'form' | 'auth'>('form');
  const [showTriggerInfo, setShowTriggerInfo] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // If email alert is toggled and user is logged in, auto pre-fill with their email
  React.useEffect(() => {
    if (sendEmailAlerts && user?.email && !notificationEmail) {
      setNotificationEmail(user.email);
    }
  }, [user, sendEmailAlerts, notificationEmail]);

  const createJobMutation = useCreateJobMutation();
  const { data: jobs = [], isSuccess: jobsLoaded } = useJobsQuery();
  const probeUrlMutation = useProbeUrlMutation();
  const checkSessionMutation = useCheckSessionMutation();
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<JobFormField, string>>>({});
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const [probeState, setProbeState] = React.useState<{
    status: 'idle' | 'probing' | 'accessible' | 'blocked';
    urlChecked?: string;
    reason?: string;
  }>({ status: 'idle' });
  const [detectedSession, setDetectedSession] = React.useState<SessionDto | null>(null);

  const effectiveCron = useCustomCron ? customCron : cronPreset;

  const suggestedName = React.useMemo(() => {
    const names = new Set(jobs.map((job) => job.name.trim().toLocaleLowerCase()));
    let index = 1;
    while (names.has(`monitor ${index}`)) index += 1;
    return `Monitor ${index}`;
  }, [jobs]);

  React.useEffect(() => {
    if (!jobsLoaded || name.trim()) return;
    setName(suggestedName);
  }, [jobsLoaded, name, setName, suggestedName]);

  const isDirty = Boolean(
    (name.trim().length > 0 && name.trim() !== suggestedName) ||
    url.trim().length > 0 ||
    userPrompt.trim().length > 0 ||
    (sendEmailAlerts && notificationEmail.trim().length > 0) ||
    (showCustomWebhook && (webhookUrl.trim().length > 0 || webhookSecret.trim().length > 0)) ||
    captureScreenshotOnChange ||
    (useCustomCron && customCron !== '0 */6 * * *')
  );

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const clearFieldError = (field: JobFormField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const focusFirstInvalidField = (errors: Partial<Record<JobFormField, string>>) => {
    const errorKeys = Object.keys(errors) as JobFormField[];
    if (errorKeys.length === 0) return;

    const firstKey = errorKeys[0];
    const fieldIdMap: Record<JobFormField, string> = {
      url: 'target-url',
      name: 'monitor-name',
      notificationEmail: 'notify-email',
      userPrompt: 'user-prompt',
      cronExpression: useCustomCron ? 'custom-cron' : 'cron-preset',
    };

    const elementId = fieldIdMap[firstKey];
    if (elementId) {
      const element = document.getElementById(elementId);
      element?.focus();
    }
  };

  const handleUrlBlur = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const urlError = validateUrl(trimmedUrl);
    if (urlError) {
      setFieldErrors((prev) => ({ ...prev, url: urlError }));
      return;
    }

    if (probeState.urlChecked === trimmedUrl && probeState.status !== 'idle') {
      return;
    }

    setProbeState({ status: 'probing', urlChecked: trimmedUrl });
    try {
      const [probe, sessionCheck] = await Promise.all([
        probeUrlMutation.mutateAsync(trimmedUrl),
        checkSessionMutation
          .mutateAsync(trimmedUrl)
          .catch(() => ({ hasSession: false, session: null })),
      ]);

      setDetectedSession(sessionCheck.hasSession ? sessionCheck.session : null);

      if (probe.accessible) {
        setProbeState({ status: 'accessible', urlChecked: trimmedUrl });
      } else {
        setProbeState({
          status: 'blocked',
          urlChecked: trimmedUrl,
          reason: probe.reason,
        });
      }
    } catch {
      setProbeState({ status: 'idle' });
    }
  };

  const executeCreateJob = async (activeUser?: UserDto | null) => {
    setLoading(true);
    setGlobalError(null);
    try {
      await createJobMutation.mutateAsync(formToCreateJob(values, activeUser?.email));
      resetForm(emptyJobForm());
      setFieldErrors({});
      setProbeState({ status: 'idle' });
      setStep('form');
      onStepChange?.('form');
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setStep('auth');
          onStepChange?.('auth');
          return;
        }
        if (Object.keys(err.fieldErrors).length > 0) {
          setStep('form');
          onStepChange?.('form');
          setFieldErrors(err.fieldErrors as Partial<Record<JobFormField, string>>);
          focusFirstInvalidField(err.fieldErrors as Partial<Record<JobFormField, string>>);
          return;
        }
        setGlobalError(err.message);
      } else if (err instanceof Error) {
        setGlobalError(err.message);
      } else {
        setGlobalError('An unexpected error occurred while creating the monitor.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    if (sendEmailAlerts && !notificationEmail.trim() && !user?.email) {
      setFieldErrors((prev) => ({
        ...prev,
        notificationEmail: 'Please enter an alert email address.',
      }));
      return;
    }

    const validation = validateJobForm({
      name,
      url,
      userPrompt,
      notificationEmail: sendEmailAlerts ? notificationEmail : '',
      cronExpression: effectiveCron,
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      focusFirstInvalidField(validation.errors);
      return;
    }

    if (!user) {
      setStep('auth');
      onStepChange?.('auth');
      return;
    }

    await executeCreateJob(user);
  };

  if (step === 'auth') {
    const authStepContent = (
      <div className="space-y-3">
        {globalError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            {globalError}
          </div>
        )}
        <AuthForm
          initialEmail={sendEmailAlerts ? notificationEmail.trim() : ''}
          defaultMode="register"
          onBack={() => {
            setStep('form');
            onStepChange?.('form');
          }}
          onGoogleBeforeRedirect={() => {
            try {
              sessionStorage.setItem(
                PENDING_JOB_STORAGE_KEY,
                JSON.stringify({
                  name: name.trim(),
                  url: url.trim(),
                  userPrompt: userPrompt.trim(),
                  notificationEmail: sendEmailAlerts ? notificationEmail.trim() : '',
                  webhookUrl: showCustomWebhook ? webhookUrl.trim() || null : null,
                  webhookSecret: showCustomWebhook ? webhookSecret.trim() || null : null,
                  cronExpression: effectiveCron.trim(),
                })
              );
            } catch {
              // ignore storage errors
            }
          }}
          onSuccess={async (authenticatedUser) => {
            onAuthenticated?.(authenticatedUser);
            await executeCreateJob(authenticatedUser);
          }}
        />
      </div>
    );

    if (isModal) {
      return authStepContent;
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign in to activate monitor</CardTitle>
        </CardHeader>
        <CardContent>{authStepContent}</CardContent>
      </Card>
    );
  }

  const formContent = (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormField
        label="Monitor name"
        htmlFor="monitor-name"
        required
        error={fieldErrors.name}
        hint="A unique name to identify this monitor."
      >
        <Input
          id="monitor-name"
          value={name}
          hasError={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? 'monitor-name-error' : undefined}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError('name');
          }}
        />
      </FormField>

      <FormField
        label="Target Website URL"
        htmlFor="target-url"
        required
        error={fieldErrors.url}
        hint={
          probeState.status === 'probing' ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              Checking website accessibility...
            </span>
          ) : probeState.status === 'accessible' && !fieldErrors.url ? (
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <CheckCircle2 className="h-3 w-3 text-foreground" />
              Website verified and accessible for automated monitoring.
            </span>
          ) : probeState.status === 'blocked' ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Protected by anti-bot checks. Background residential unblockers will handle
              extraction.
            </span>
          ) : (
            'Website URL to monitor for dynamic updates.'
          )
        }
      >
        <Input
          id="target-url"
          type="url"
          placeholder="https://example.com/products/item"
          value={url}
          hasError={Boolean(fieldErrors.url)}
          aria-describedby={fieldErrors.url ? 'target-url-error' : undefined}
          onChange={(e) => {
            setUrl(e.target.value);
            clearFieldError('url');
            setDetectedSession(null);
            if (probeState.status !== 'idle') {
              setProbeState({ status: 'idle' });
            }
          }}
          onBlur={handleUrlBlur}
        />
        {detectedSession && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-md">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>
              Active authenticated session detected ({detectedSession.domain}) via Specter
              Extension. Scraper will run authenticated!
            </span>
          </div>
        )}
      </FormField>

      <FormField
        label={
          <div className="flex items-center gap-1.5">
            <span>Extraction Instructions</span>
            <button
              type="button"
              onClick={() => setShowTriggerInfo((prev) => !prev)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-muted"
              title="Tip: You can set alert conditions directly in the prompt or configure them later"
              aria-label="Toggle conditional trigger tips"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        }
        htmlFor="user-prompt"
        required
        error={fieldErrors.userPrompt}
        hint={
          <span>
            Describe what to extract (min. 5 chars).
            <button
              type="button"
              onClick={() => setShowTriggerInfo((prev) => !prev)}
              className="ml-1 text-primary hover:underline font-medium inline-flex items-center gap-0.5"
            >
              Learn how alert conditions work
            </button>
          </span>
        }
      >
        <Textarea
          id="user-prompt"
          placeholder={`e.g. Extract the product title, current price, and stock status.\n\nOptional condition: Notify only if price drops by 10% or if status changes to 'Available'.`}
          value={userPrompt}
          hasError={Boolean(fieldErrors.userPrompt)}
          aria-describedby={fieldErrors.userPrompt ? 'user-prompt-error' : undefined}
          onChange={(e) => {
            setUserPrompt(e.target.value);
            clearFieldError('userPrompt');
          }}
          rows={4}
        />
      </FormField>

      {/* Info Callout for Conditional Triggers */}
      {showTriggerInfo && (
        <TriggerHelpCallout onDismiss={() => setShowTriggerInfo(false)} />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <JobScheduleFields
          value={values}
          onChange={(schedule) => resetForm((previous) => ({ ...previous, ...schedule }))}
          onEdit={() => clearFieldError('cronExpression')}
          error={fieldErrors.cronExpression}
          prefix=""
          label="Monitoring Frequency"
          timeZone={user?.timezone || getBrowserTimezone()}
        />
      </div>

      <div className="space-y-3 pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            id="capture-screenshot"
            checked={captureScreenshotOnChange}
            onChange={(e) => setCaptureScreenshotOnChange(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
          />
          <span className="text-sm font-medium text-foreground">Capture screenshot on change</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            id="send-email-alerts"
            checked={sendEmailAlerts}
            onChange={(e) => {
              const checked = e.target.checked;
              setSendEmailAlerts(checked);
              if (checked) {
                if (!notificationEmail && user?.email) {
                  setNotificationEmail(user.email);
                }
              } else {
                clearFieldError('notificationEmail');
              }
            }}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
          />
          <span className="text-sm font-medium text-foreground">Send notifications via email</span>
        </label>

        {sendEmailAlerts && (
          <FormField
            label="Alert Email Address"
            htmlFor="notify-email"
            required
            error={fieldErrors.notificationEmail}
            hint="Destination email address for detected change notifications."
          >
            <Input
              id="notify-email"
              type="email"
              placeholder={user?.email || 'alerts@company.com'}
              value={notificationEmail}
              hasError={Boolean(fieldErrors.notificationEmail)}
              aria-describedby={fieldErrors.notificationEmail ? 'notify-email-error' : undefined}
              onChange={(e) => {
                setNotificationEmail(e.target.value);
                clearFieldError('notificationEmail');
              }}
            />
          </FormField>
        )}

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCustomWebhook}
            onChange={(e) => {
              setShowCustomWebhook(e.target.checked);
              if (!e.target.checked) {
                setWebhookUrl('');
                setWebhookSecret('');
              }
            }}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
          />
          <span className="text-sm font-medium text-foreground">
            Send notifications to a custom webhook URL
          </span>
        </label>

        {showCustomWebhook && (
          <div className="space-y-4">
            <FormField
              label="Custom Webhook URL"
              htmlFor="job-webhook"
              hint="Optional. Destination endpoint URL for this specific monitor."
            >
              <Input
                id="job-webhook"
                type="url"
                placeholder="https://your-domain.com/webhook (optional)"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </FormField>

            <FormField
              label="Signing Secret (Optional HMAC-SHA256)"
              htmlFor="job-webhook-secret"
              hint="When configured, payloads are signed with header X-Specter-Signature-256 for integrity verification."
            >
              <PasswordInput
                id="job-webhook-secret"
                placeholder="whsec_xxxxxxxxxxxxxxxx (optional)"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="font-mono text-xs sm:text-sm"
                toggleAriaLabel="Toggle webhook signing secret visibility"
              />
            </FormField>
          </div>
        )}
      </div>

      {globalError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3.5 text-xs sm:text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {globalError}
        </div>
      )}

      <div className="flex justify-end gap-2.5 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4 text-sm"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" className="h-10 px-5 text-sm" disabled={loading}>
          <Plus className="h-4 w-4" />
          {loading ? 'Creating...' : 'Create Monitor'}
        </Button>
      </div>
    </form>
  );

  if (isModal) {
    return formContent;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New Monitor</CardTitle>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
