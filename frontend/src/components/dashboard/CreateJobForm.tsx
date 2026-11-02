'use client';

import * as React from 'react';
import { CheckCircle2, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { cn, CRON_PRESETS } from '@/lib/utils';
import { validateJobForm, validateUrl, type JobFormField } from '@/lib/validation';

export interface CreateJobFormProps {
  onCreated: () => void;
  onCancel?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  isModal?: boolean;
}

export function CreateJobForm({
  onCreated,
  onCancel,
  onDirtyChange,
  isModal = false,
}: CreateJobFormProps) {
  const [url, setUrl] = React.useState('');
  const [userPrompt, setUserPrompt] = React.useState('');
  const [notificationEmail, setNotificationEmail] = React.useState('');
  const [cronPreset, setCronPreset] = React.useState('0 */6 * * *');
  const [customCron, setCustomCron] = React.useState('0 */6 * * *');
  const [useCustomCron, setUseCustomCron] = React.useState(false);
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
        const errorMsg =
          probe.reason ||
          'Target website is protected against automated requests. Monitoring cannot be created for this URL.';
        setProbeState({
          status: 'blocked',
          urlChecked: trimmedUrl,
          reason: errorMsg,
        });
        setFieldErrors((prev) => ({ ...prev, url: errorMsg }));
      }
    } catch {
      setProbeState({ status: 'idle' });
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

    setLoading(true);
    try {
      await api.createJob({
        url: url.trim(),
        userPrompt: userPrompt.trim(),
        notificationEmail: notificationEmail.trim(),
        cronExpression: effectiveCron.trim(),
      });

      setUrl('');
      setUserPrompt('');
      setNotificationEmail('');
      setCronPreset('0 */6 * * *');
      setCustomCron('0 */6 * * *');
      setUseCustomCron(false);
      setFieldErrors({});
      setProbeState({ status: 'idle' });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fieldErrors).length > 0) {
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
        label="Extraction Instructions"
        htmlFor="user-prompt"
        required
        error={fieldErrors.userPrompt}
        hint="Describe the fields and data attributes to extract (min. 5 chars)."
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
              'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-50',
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
              className="font-mono text-xs"
            />
          </FormField>
        )}
      </div>

      {globalError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {globalError}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
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
