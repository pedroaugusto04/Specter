'use client';

import * as React from 'react';
import { CheckCircle2, Loader2, Plus, Sparkles } from 'lucide-react';
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
      const res = await api.probeUrl(trimmedUrl);
      if (res.accessible) {
        setProbeState({ status: 'accessible', urlChecked: trimmedUrl });
        clearFieldError('url');
      } else {
        const errorMsg =
          res.reason ||
          'This website blocks automated access (Anti-Bot / CAPTCHA protection detected).';
        setProbeState({ status: 'blocked', urlChecked: trimmedUrl, reason: errorMsg });
        setFieldErrors((prev) => ({ ...prev, url: errorMsg }));
      }
    } catch {
      setProbeState({ status: 'idle', urlChecked: trimmedUrl });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    // Standardized client-side validation
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

    if (probeState.status === 'blocked' && probeState.urlChecked === url.trim()) {
      const errorMsg =
        probeState.reason ||
        'This website blocks automated access (Anti-Bot / CAPTCHA protection detected).';
      setFieldErrors((prev) => ({ ...prev, url: errorMsg }));
      focusFirstInvalidField({ url: errorMsg });
      return;
    }

    setFieldErrors({});
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
      setCronPreset('0 */6 * * *');
      setCustomCron('0 */6 * * *');
      setUseCustomCron(false);
      setFieldErrors({});
      setGlobalError(null);
      setProbeState({ status: 'idle' });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
          const apiFieldErrors = err.fieldErrors as Partial<Record<JobFormField, string>>;
          setFieldErrors(apiFieldErrors);
          focusFirstInvalidField(apiFieldErrors);

          // If there is a root or general error distinct from standard fields
          if (err.fieldErrors.root) {
            setGlobalError(err.fieldErrors.root);
          }
        } else {
          setGlobalError(err.message || 'Validation failed on server.');
        }
      } else {
        setGlobalError(err instanceof Error ? err.message : 'Failed to create monitoring job.');
      }
    } finally {
      setLoading(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          label="Target URL"
          htmlFor="target-url"
          required
          error={fieldErrors.url}
          hint={
            probeState.status === 'probing' ? (
              <span className="flex items-center gap-1.5 text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                Checking website accessibility...
              </span>
            ) : probeState.status === 'accessible' && !fieldErrors.url ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
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
          label="Alert Email (Resend)"
          htmlFor="notify-email"
          required
          error={fieldErrors.notificationEmail}
          hint="Destination email for detected change reports."
        >
          <Input
            id="notify-email"
            type="email"
            placeholder="alerts@company.com"
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
        hint="Natural language instructions describing the data attributes to scrape (min. 5 chars)."
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
          hint={!useCustomCron ? 'Minimum allowed interval floor is 15 minutes.' : undefined}
        >
          <select
            id="cron-preset"
            aria-invalid={!useCustomCron && Boolean(fieldErrors.cronExpression)}
            aria-describedby={!useCustomCron && fieldErrors.cronExpression ? 'cron-preset-error' : undefined}
            className={cn(
              'flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
              !useCustomCron && fieldErrors.cronExpression
                ? 'border-red-400 text-red-950 focus-visible:border-red-500 focus-visible:ring-red-500/30 bg-red-50/20'
                : 'border-slate-200 focus-visible:ring-slate-900'
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
              <option key={preset.value} value={preset.value}>
                {preset.label} ({preset.value})
              </option>
            ))}
            <option value="custom">Custom Cron Expression...</option>
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
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
        >
          {globalError}
        </div>
      )}

      <div className="flex justify-end gap-2.5 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          <Plus className="h-4 w-4" />
          {loading ? 'Compiling & Scheduling...' : 'Create Monitor'}
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
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-slate-900" />
          <CardTitle className="text-base">New Autonomous Monitor</CardTitle>
        </div>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
