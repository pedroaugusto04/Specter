'use client';

import { formToUpdateJob, jobToForm } from '@/forms/jobForm';
import { useJobForm } from '@/hooks/useJobForm';
import { useJobFormFeedback } from '@/hooks/useJobFormFeedback';
import { JobScheduleFields } from './JobScheduleFields';
import { TriggerRulesEditor } from './TriggerRulesEditor';
import { getBrowserTimezone } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useUpdateJobMutation } from '@/hooks/useDashboardQueries';
import { ApiError, type ScrapingJobDto, type UserDto } from '@/lib/api';
import { TriggerMatchMode } from '@specter/contracts';
import { type JobFormField } from '@/lib/validation';
import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import * as React from 'react';

export interface EditJobModalProps {
  job: ScrapingJobDto | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  user?: UserDto | null;
}

export function EditJobModal({ job, isOpen, onClose, onUpdated, user }: EditJobModalProps) {
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
    setTriggerRules,
    setTriggerMatchMode,
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
    triggerRules,
    triggerMatchMode,
  } = values;
  const updateJobMutation = useUpdateJobMutation();
  const [clearWebhookSecret, setClearWebhookSecret] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const {
    fieldErrors,
    setFieldErrors,
    globalError,
    setGlobalError,
    clearFieldError,
    focusFirstInvalidField,
    validateFields,
  } = useJobFormFeedback(values, user?.email, 'edit-');

  React.useEffect(() => {
    if (job && isOpen) {
      resetForm(jobToForm(job, user?.email));
      setClearWebhookSecret(false);
      setFieldErrors({});
      setGlobalError(null);
    }
  }, [job, isOpen]);

  const effectiveCron = useCustomCron ? customCron : cronPreset;

  const willRecompile = Boolean(
    job && (url.trim() !== job.url || userPrompt.trim() !== job.userPrompt)
  );

  const rulesChanged = React.useMemo(() => {
    const origRules = job?.extractionPlan?.intent.triggerRules || [];
    const origMode = job?.extractionPlan?.intent.triggerMatchMode ?? TriggerMatchMode.All;
    if (triggerMatchMode !== origMode) return true;
    if (triggerRules.length !== origRules.length) return true;
    return JSON.stringify(triggerRules) !== JSON.stringify(origRules);
  }, [job, triggerRules, triggerMatchMode]);

  const isDirty = Boolean(
    job &&
    (name.trim() !== job.name ||
      url.trim() !== job.url ||
      userPrompt.trim() !== job.userPrompt ||
      (sendEmailAlerts ? notificationEmail.trim() : '') !== (job.notificationEmail || '') ||
      sendEmailAlerts !==
        Boolean(job.notificationEmail && job.notificationEmail.trim().length > 0) ||
      (showCustomWebhook ? webhookUrl.trim() : '') !== (job.webhookUrl || '') ||
      showCustomWebhook !== Boolean(job.webhookUrl && job.webhookUrl.trim().length > 0) ||
      Boolean(webhookSecret.trim()) ||
      clearWebhookSecret ||
      captureScreenshotOnChange !== Boolean(job.captureScreenshotOnChange) ||
      effectiveCron.trim() !== job.cronExpression ||
      rulesChanged)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;

    setGlobalError(null);

    if (!validateFields()) return;

    setLoading(true);
    try {
      await updateJobMutation.mutateAsync({
        id: job.id,
        payload: formToUpdateJob(values, { clearWebhookSecret }),
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

  const availableExtractorFields = Object.keys(job?.extractionPlan?.intent.fields || {});

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      title="Edit Monitor"
      description="Update target URL, extraction instructions, conditional alert rules, or check schedule."
      confirmTitle="Discard Unsaved Changes?"
      confirmMessage="You have modified the monitor settings. Closing now will discard your changes. Are you sure you want to close?"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField
          label="Monitor name"
          htmlFor="edit-monitor-name"
          required
          error={fieldErrors.name}
          hint=""
        >
          <Input
            id="edit-monitor-name"
            value={name}
            hasError={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'edit-monitor-name-error' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              clearFieldError('name');
            }}
          />
        </FormField>

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

        {/* CONDITIONAL ALERT TRIGGERS */}
        <TriggerRulesEditor
          triggerRules={triggerRules}
          onChange={setTriggerRules}
          triggerMatchMode={triggerMatchMode}
          onMatchModeChange={setTriggerMatchMode}
          availableFields={availableExtractorFields}
          fieldTypes={job?.extractionPlan?.intent.fields}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-2 border-t border-border">
          <JobScheduleFields
            value={values}
            onChange={(schedule) => resetForm((previous) => ({ ...previous, ...schedule }))}
            onEdit={() => clearFieldError('cronExpression')}
            error={fieldErrors.cronExpression}
            prefix="edit-"
            label="Check Frequency"
            timeZone={user?.timezone || getBrowserTimezone()}
          />
        </div>

        <div className="space-y-3 pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              id="edit-capture-screenshot"
              checked={captureScreenshotOnChange}
              onChange={(e) => setCaptureScreenshotOnChange(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
            />
            <span className="text-sm font-medium text-foreground">
              Capture screenshot on change
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCustomWebhook}
              onChange={(e) => {
                setShowCustomWebhook(e.target.checked);
                if (!e.target.checked) {
                  setWebhookUrl('');
                  setWebhookSecret('');
                  setClearWebhookSecret(false);
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
                label="Signing Secret (Optional HMAC-SHA256)"
                htmlFor="edit-job-webhook-secret"
                hint="When configured, payloads are signed with header X-Specter-Signature-256 for integrity verification."
              >
                <PasswordInput
                  id="edit-job-webhook-secret"
                  placeholder={
                    job?.hasWebhookSecret
                      ? 'Secret configured; leave blank to keep it'
                      : 'whsec_xxxxxxxxxxxxxxxx (optional)'
                  }
                  value={webhookSecret}
                  onChange={(e) => {
                    setWebhookSecret(e.target.value);
                    setClearWebhookSecret(false);
                  }}
                  className="font-mono text-xs sm:text-sm"
                  toggleAriaLabel="Toggle webhook signing secret visibility"
                />
              </FormField>

              {job?.hasWebhookSecret && (
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={clearWebhookSecret}
                    onChange={(event) => {
                      setClearWebhookSecret(event.target.checked);
                      setWebhookSecret('');
                    }}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                  />
                  Remove the configured signing secret
                </label>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              id="edit-send-email-alerts"
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
            <span className="text-sm font-medium text-foreground">
              Send notifications via email
            </span>
          </label>

          {sendEmailAlerts && (
            <FormField
              label="Alert Email Address"
              htmlFor="edit-notify-email"
              required
              error={fieldErrors.notificationEmail}
              hint="Destination email address for detected change notifications."
            >
              <Input
                id="edit-notify-email"
                type="email"
                placeholder={user?.email || 'alerts@company.com'}
                value={notificationEmail}
                hasError={Boolean(fieldErrors.notificationEmail)}
                aria-describedby={
                  fieldErrors.notificationEmail ? 'edit-notify-email-error' : undefined
                }
                onChange={(e) => {
                  setNotificationEmail(e.target.value);
                  clearFieldError('notificationEmail');
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
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4 text-sm"
            onClick={onClose}
            disabled={loading}
          >
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
