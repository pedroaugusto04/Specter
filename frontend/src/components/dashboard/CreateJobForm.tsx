'use client';

import * as React from 'react';
import { CheckCircle2, HelpCircle, Loader2, Plus } from 'lucide-react';
import { AuthForm } from '@/components/auth/AuthForm';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { ApiError, api, type UserDto } from '@/lib/api';
import { cn, CRON_PRESETS } from '@/lib/utils';
import { validateJobForm, validateUrl, type JobFormField } from '@/lib/validation';

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
  const [step, setStep] = React.useState<'form' | 'auth'>('form');
  const [url, setUrl] = React.useState('');
  const [userPrompt, setUserPrompt] = React.useState('');
  const [notificationEmail, setNotificationEmail] = React.useState('');
  const [webhookUrl, setWebhookUrl] = React.useState('');
  const [cronPreset, setCronPreset] = React.useState('0 */6 * * *');
  const [customCron, setCustomCron] = React.useState('0 */6 * * *');
  const [useCustomCron, setUseCustomCron] = React.useState(false);
  const [showTriggerInfo, setShowTriggerInfo] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<JobFormField, string>>>({});
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const [probeState, setProbeState] = React.useState<{
    status: 'idle' | 'probing' | 'accessible' | 'blocked';
    urlChecked?: string;
    reason?: string;
  }>({ status: 'idle' });

  const effectiveCron = useCustomCron ? customCron : cronPreset;

  const isDirty = Boolean(
    url.trim().length > 0 ||
    userPrompt.trim().length > 0 ||
    notificationEmail.trim().length > 0 ||
    webhookUrl.trim().length > 0 ||
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
      const probe = await api.probeUrl(trimmedUrl);
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
      await api.createJob({
        url: url.trim(),
        userPrompt: userPrompt.trim(),
        notificationEmail: notificationEmail.trim() || activeUser?.email || '',
        webhookUrl: webhookUrl.trim() || null,
        cronExpression: effectiveCron.trim(),
      });

      setUrl('');
      setUserPrompt('');
      setNotificationEmail('');
      setWebhookUrl('');
      setCronPreset('0 */6 * * *');
      setCustomCron('0 */6 * * *');
      setUseCustomCron(false);
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

    const validation = validateJobForm({
      url,
      userPrompt,
      notificationEmail,
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
          initialEmail={notificationEmail.trim()}
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
                  url: url.trim(),
                  userPrompt: userPrompt.trim(),
                  notificationEmail: notificationEmail.trim(),
                  webhookUrl: webhookUrl.trim() || null,
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                Protected by anti-bot checks. Background residential unblockers will handle extraction.
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
              if (probeState.status !== 'idle') {
                setProbeState({ status: 'idle' });
              }
            }}
            onBlur={handleUrlBlur}
          />
        </FormField>

        <FormField
          label="Alert Email"
          htmlFor="notify-email"
          error={fieldErrors.notificationEmail}
          hint="Optional. Destination email for detected change reports."
        >
          <Input
            id="notify-email"
            type="email"
            placeholder="alerts@company.com (optional)"
            value={notificationEmail}
            hasError={Boolean(fieldErrors.notificationEmail)}
            aria-describedby={fieldErrors.notificationEmail ? 'notify-email-error' : undefined}
            onChange={(e) => {
              setNotificationEmail(e.target.value);
              clearFieldError('notificationEmail');
            }}
          />
        </FormField>
      </div>

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
        label={
          <div className="flex items-center gap-1.5">
            <span>Extraction Instructions</span>
            <button
              type="button"
              onClick={() => setShowTriggerInfo((prev) => !prev)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-muted"
              title="Tip: You can filter alerts by price thresholds (<, >, etc.)"
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
            Describe the fields and data attributes to extract (min. 5 chars).
            <button
              type="button"
              onClick={() => setShowTriggerInfo((prev) => !prev)}
              className="ml-1 text-primary hover:underline font-medium inline-flex items-center gap-0.5"
            >
              Learn about price triggers
            </button>
          </span>
        }
      >
        <Textarea
          id="user-prompt"
          placeholder="e.g. Extract the product title, current price, stock availability, and the purchase link."
          value={userPrompt}
          hasError={Boolean(fieldErrors.userPrompt)}
          aria-describedby={fieldErrors.userPrompt ? 'user-prompt-error' : undefined}
          onChange={(e) => {
            setUserPrompt(e.target.value);
            clearFieldError('userPrompt');
          }}
          rows={3}
        />
      </FormField>

      {/* Info Callout for Price / Conditional Triggers */}
      {showTriggerInfo && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between font-medium text-foreground">
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-primary" />
              Price Difference & Conditional Alert Triggers
            </span>
            <button
              type="button"
              onClick={() => setShowTriggerInfo(false)}
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
          <p>
            Once your monitor is created and its fields (such as <code className="text-foreground font-mono">price</code>) are discovered, you can set granular alert triggers so notifications only fire when specific conditions are met.
          </p>
          <div className="space-y-1 pt-1 text-[11px]">
            <div className="font-semibold text-foreground">Supported comparison operators:</div>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li><code className="text-foreground font-mono">&lt; Less than (lt)</code> / <code className="text-foreground font-mono">&le; (lte)</code>: Trigger when price drops below a threshold.</li>
              <li><code className="text-foreground font-mono">&gt; Greater than (gt)</code> / <code className="text-foreground font-mono">&ge; (gte)</code>: Trigger when price exceeds a threshold.</li>
              <li><code className="text-foreground font-mono">== (eq)</code> / <code className="text-foreground font-mono">!= (neq)</code>: Exact equality for price, stock, or status.</li>
              <li><code className="text-foreground font-mono">Contains / Does not contain</code>: Substring checks (e.g. availability).</li>
            </ul>
          </div>
          <div className="rounded border border-border/60 bg-background/50 p-2 font-mono text-[11px] text-foreground">
            <strong>Example rule:</strong> &quot;Notify me only if <span className="text-primary font-semibold">price &lt; 299.99</span>&quot;
            <div className="mt-1 text-[11px] text-muted-foreground font-sans">
              You can configure this anytime by clicking <strong>Edit</strong> on any active monitor.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          label="Monitoring Frequency (Cron Schedule)"
          htmlFor="cron-preset"
          required
          error={!useCustomCron ? fieldErrors.cronExpression : undefined}
        >
          <select
            id="cron-preset"
            aria-invalid={!useCustomCron && Boolean(fieldErrors.cronExpression)}
            aria-describedby={!useCustomCron && fieldErrors.cronExpression ? 'cron-preset-error' : undefined}
            className={cn(
              'flex h-10 w-full rounded-md border bg-background px-3.5 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-50',
              !useCustomCron && fieldErrors.cronExpression
                ? 'border-red-600 bg-red-50/40 dark:border-red-500/80 dark:bg-red-950/20'
                : 'border-input'
            )}
            value={useCustomCron ? 'custom' : cronPreset}
            onChange={(e) => {
              clearFieldError('cronExpression');
              if (e.target.value === 'custom') {
                setUseCustomCron(true);
              } else {
                setUseCustomCron(false);
                setCronPreset(e.target.value);
                setCustomCron(e.target.value);
              }
            }}
          >
            {CRON_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value} className="bg-background text-foreground">
                {preset.label} ({preset.value})
              </option>
            ))}
            <option value="custom" className="bg-background text-foreground">Custom Cron Expression...</option>
          </select>
        </FormField>

        {useCustomCron && (
          <FormField
            label="Custom Cron Expression (min. 15m)"
            htmlFor="custom-cron"
            required
            error={fieldErrors.cronExpression}
            hint="5 space-delimited fields: minute hour day month weekday."
          >
            <Input
              id="custom-cron"
              placeholder="0 */6 * * *"
              value={customCron}
              hasError={Boolean(fieldErrors.cronExpression)}
              aria-describedby={fieldErrors.cronExpression ? 'custom-cron-error' : undefined}
              onChange={(e) => {
                setCustomCron(e.target.value);
                clearFieldError('cronExpression');
              }}
              className="font-mono text-sm"
            />
          </FormField>
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
          <Button type="button" variant="outline" className="h-10 px-4 text-sm" onClick={onCancel} disabled={loading}>
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
