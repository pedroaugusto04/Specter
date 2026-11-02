'use client';

import * as React from 'react';
import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { ApiError, api, type ScrapingJobDto } from '@/lib/api';
import { cn, CRON_PRESETS } from '@/lib/utils';
import { validateJobForm, type JobFormField } from '@/lib/validation';

export interface EditJobModalProps {
  job: ScrapingJobDto | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditJobModal({ job, isOpen, onClose, onUpdated }: EditJobModalProps) {
  const [url, setUrl] = React.useState('');
  const [userPrompt, setUserPrompt] = React.useState('');
  const [notificationEmail, setNotificationEmail] = React.useState('');
  const [webhookUrl, setWebhookUrl] = React.useState('');
  const [cronPreset, setCronPreset] = React.useState('0 */6 * * *');
  const [customCron, setCustomCron] = React.useState('0 */6 * * *');
  const [useCustomCron, setUseCustomCron] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<JobFormField, string>>>({});
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (job && isOpen) {
      setUrl(job.url);
      setUserPrompt(job.userPrompt);
      setNotificationEmail(job.notificationEmail);
      setWebhookUrl(job.webhookUrl || '');

      const isPreset = CRON_PRESETS.some((p) => p.value === job.cronExpression);
      if (isPreset) {
        setCronPreset(job.cronExpression);
        setCustomCron(job.cronExpression);
        setUseCustomCron(false);
      } else {
        setCronPreset('0 */6 * * *');
        setCustomCron(job.cronExpression);
        setUseCustomCron(true);
      }

      setFieldErrors({});
      setGlobalError(null);
    }
  }, [job, isOpen]);

  const effectiveCron = useCustomCron ? customCron : cronPreset;

  const willRecompile = Boolean(
    job && (url.trim() !== job.url || userPrompt.trim() !== job.userPrompt)
  );

  const isDirty = Boolean(
    job &&
      (url.trim() !== job.url ||
        userPrompt.trim() !== job.userPrompt ||
        notificationEmail.trim() !== job.notificationEmail ||
        webhookUrl.trim() !== (job.webhookUrl || '') ||
        effectiveCron.trim() !== job.cronExpression)
  );

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
      url: 'edit-target-url',
      notificationEmail: 'edit-notify-email',
      userPrompt: 'edit-user-prompt',
      cronExpression: useCustomCron ? 'edit-custom-cron' : 'edit-cron-preset',
    };

    const elementId = fieldIdMap[firstKey];
    if (elementId) {
      document.getElementById(elementId)?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;

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
      await api.updateJob(job.id, {
        url: url.trim(),
        userPrompt: userPrompt.trim(),
        notificationEmail: notificationEmail.trim() || undefined,
        webhookUrl: webhookUrl.trim() || null,
        cronExpression: effectiveCron.trim(),
      });

      onUpdated();
      onClose();
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
        setGlobalError('An unexpected error occurred while updating the monitor.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      title="Edit Monitor"
      description="Update target URL, extraction instructions, or check schedule."
      confirmTitle="Discard Unsaved Changes?"
      confirmMessage="You have modified the monitor settings. Closing now will discard your changes. Are you sure you want to close?"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {willRecompile && (
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/60 p-3.5 text-xs sm:text-sm text-foreground">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-foreground mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">Schema Re-compilation</p>
              <p className="mt-0.5 text-muted-foreground leading-relaxed">
                Modifying the Target URL or Extraction Instructions will invalidate the current
                extraction schema and trigger a new analysis of the target page.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            label="Target Website URL"
            htmlFor="edit-target-url"
            required
            error={fieldErrors.url}
            hint="URL of the page to monitor."
          >
            <Input
              id="edit-target-url"
              type="url"
              placeholder="https://example.com/products/item"
              value={url}
              hasError={Boolean(fieldErrors.url)}
              aria-describedby={fieldErrors.url ? 'edit-target-url-error' : undefined}
              onChange={(e) => {
                setUrl(e.target.value);
                clearFieldError('url');
              }}
            />
          </FormField>

          <FormField
            label="Alert Email"
            htmlFor="edit-notify-email"
            error={fieldErrors.notificationEmail}
            hint="Optional. Recipient for diff alert notifications."
          >
            <Input
              id="edit-notify-email"
              type="email"
              placeholder="alerts@company.com (optional)"
              value={notificationEmail}
              hasError={Boolean(fieldErrors.notificationEmail)}
              aria-describedby={fieldErrors.notificationEmail ? 'edit-notify-email-error' : undefined}
              onChange={(e) => {
                setNotificationEmail(e.target.value);
                clearFieldError('notificationEmail');
              }}
            />
          </FormField>
        </div>

        <FormField
          label="Custom Webhook URL"
          htmlFor="edit-job-webhook"
          hint="Optional. Custom endpoint URL for this specific monitor."
        >
          <Input
            id="edit-job-webhook"
            type="url"
            placeholder="https://your-domain.com/webhook (optional)"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </FormField>

        <FormField
          label="Extraction Instructions"
          htmlFor="edit-user-prompt"
          required
          error={fieldErrors.userPrompt}
          hint="Describe the fields and data attributes to extract (min. 5 chars)."
        >
          <Textarea
            id="edit-user-prompt"
            placeholder="e.g. Extract the product title, current price, stock availability, and the purchase link."
            value={userPrompt}
            hasError={Boolean(fieldErrors.userPrompt)}
            aria-describedby={fieldErrors.userPrompt ? 'edit-user-prompt-error' : undefined}
            onChange={(e) => {
              setUserPrompt(e.target.value);
              clearFieldError('userPrompt');
            }}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            label="Check Frequency"
            htmlFor="edit-cron-preset"
            required
            error={!useCustomCron ? fieldErrors.cronExpression : undefined}
          >
            <select
              id="edit-cron-preset"
              aria-invalid={!useCustomCron && Boolean(fieldErrors.cronExpression)}
              aria-describedby={!useCustomCron && fieldErrors.cronExpression ? 'edit-cron-preset-error' : undefined}
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
              label="Cron Expression (5 fields, min. 15m)"
              htmlFor="edit-custom-cron"
              required
              error={fieldErrors.cronExpression}
              hint="5 space-delimited fields: min hour day month weekday."
            >
              <Input
                id="edit-custom-cron"
                placeholder="*/15 * * * *"
                value={customCron}
                hasError={Boolean(fieldErrors.cronExpression)}
                aria-describedby={fieldErrors.cronExpression ? 'edit-custom-cron-error' : undefined}
                onChange={(e) => {
                  setCustomCron(e.target.value);
                  clearFieldError('cronExpression');
                }}
              />
            </FormField>
          )}
        </div>

        {globalError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3.5 text-xs sm:text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            {globalError}
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="outline" className="h-10 px-4 text-sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" className="h-10 px-5 text-sm" disabled={loading || !isDirty}>
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>Save Changes</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
