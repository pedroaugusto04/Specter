'use client';

import * as React from 'react';
import { AlertTriangle, Check, HelpCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { ApiError, api, type ScrapingJobDto, type TriggerOperator, type TriggerRule } from '@/lib/api';
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
  const [triggerRules, setTriggerRules] = React.useState<TriggerRule[]>([]);
  const [triggerMatchMode, setTriggerMatchMode] = React.useState<'any' | 'all'>('all');
  const [showTriggerHelp, setShowTriggerHelp] = React.useState(false);
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

      setTriggerRules(
        job.extractorConfig?.triggerRules ? [...job.extractorConfig.triggerRules] : []
      );
      setTriggerMatchMode(job.extractorConfig?.triggerMatchMode || 'all');

      setFieldErrors({});
      setGlobalError(null);
    }
  }, [job, isOpen]);

  const effectiveCron = useCustomCron ? customCron : cronPreset;

  const willRecompile = Boolean(
    job && (url.trim() !== job.url || userPrompt.trim() !== job.userPrompt)
  );

  const rulesChanged = React.useMemo(() => {
    const origRules = job?.extractorConfig?.triggerRules || [];
    const origMode = job?.extractorConfig?.triggerMatchMode || 'all';
    if (triggerMatchMode !== origMode) return true;
    if (triggerRules.length !== origRules.length) return true;
    return JSON.stringify(triggerRules) !== JSON.stringify(origRules);
  }, [job, triggerRules, triggerMatchMode]);

  const isDirty = Boolean(
    job &&
      (url.trim() !== job.url ||
        userPrompt.trim() !== job.userPrompt ||
        notificationEmail.trim() !== job.notificationEmail ||
        webhookUrl.trim() !== (job.webhookUrl || '') ||
        effectiveCron.trim() !== job.cronExpression ||
        rulesChanged)
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
        triggerRules,
        triggerMatchMode,
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

  const availableExtractorFields = Object.keys(job?.extractorConfig?.fields || {});

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

        {/* CONDITIONAL ALERT TRIGGERS */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <span>Conditional Alert Triggers</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    (Zero-token rule evaluation)
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTriggerHelp((prev) => !prev)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-muted"
                  title="How do price and conditional alert triggers work?"
                  aria-label="Toggle conditional alert trigger info"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Only send notifications when extracted fields meet these conditions.
              </p>
            </div>
            {triggerRules.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Match:</span>
                <button
                  type="button"
                  onClick={() => setTriggerMatchMode(triggerMatchMode === 'all' ? 'any' : 'all')}
                  className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
                >
                  {triggerMatchMode === 'all' ? 'ALL conditions' : 'ANY condition'}
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Info / Help Box */}
          {showTriggerHelp && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-2 text-xs text-muted-foreground transition-all">
              <div className="flex items-center justify-between font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-primary" />
                  How Price & Field Triggers Work
                </span>
                <button
                  type="button"
                  onClick={() => setShowTriggerHelp(false)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
              <p>
                By default, Specter notifies you whenever any monitored content changes. With conditional triggers, you only receive alerts when specific criteria are satisfied (e.g. price drops below a threshold).
              </p>
              <div className="space-y-1 pt-1 text-[11px]">
                <div className="font-semibold text-foreground">Available Operators:</div>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  <li><code className="text-foreground font-mono">&lt; Less than (lt)</code> / <code className="text-foreground font-mono">&le; (lte)</code>: Trigger when numeric price drops (e.g. <span className="font-mono text-foreground">price &lt; 150</span>).</li>
                  <li><code className="text-foreground font-mono">&gt; Greater than (gt)</code> / <code className="text-foreground font-mono">&ge; (gte)</code>: Trigger on target increases.</li>
                  <li><code className="text-foreground font-mono">== (eq)</code> / <code className="text-foreground font-mono">!= (neq)</code>: Exact equality for numbers, booleans, or text.</li>
                  <li><code className="text-foreground font-mono">Contains / Does not contain</code>: Substring matching (e.g. <span className="font-mono text-foreground">status contains &quot;in stock&quot;</span>).</li>
                </ul>
              </div>
              <div className="rounded border border-border/60 bg-background/50 p-2 font-mono text-[11px] text-foreground">
                <strong>Example:</strong> Alert when a product price drops below $250.00:
                <div className="mt-1 text-muted-foreground">
                  Field: <span className="text-foreground">price</span> &nbsp;|&nbsp; Operator: <span className="text-foreground">&lt; Less than</span> &nbsp;|&nbsp; Value: <span className="text-foreground">250</span>
                </div>
              </div>
            </div>
          )}

          {triggerRules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              No trigger conditions active. Alerts will trigger on any detected change.
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const defaultField = availableExtractorFields[0] || 'price';
                    setTriggerRules([...triggerRules, { field: defaultField, operator: 'lt', value: '' }]);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Trigger Rule
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {triggerRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2"
                >
                  {/* Field */}
                  <div className="w-full sm:w-1/3">
                    {availableExtractorFields.length > 0 ? (
                      <select
                        value={rule.field}
                        onChange={(e) => {
                          const updated = [...triggerRules];
                          updated[idx] = { ...rule, field: e.target.value };
                          setTriggerRules(updated);
                        }}
                        className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none"
                      >
                        {availableExtractorFields.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        placeholder="field (e.g. price)"
                        value={rule.field}
                        className="h-8 text-xs"
                        onChange={(e) => {
                          const updated = [...triggerRules];
                          updated[idx] = { ...rule, field: e.target.value };
                          setTriggerRules(updated);
                        }}
                      />
                    )}
                  </div>

                  {/* Operator */}
                  <div className="w-full sm:w-1/3">
                    <select
                      value={rule.operator}
                      onChange={(e) => {
                        const updated = [...triggerRules];
                        updated[idx] = { ...rule, operator: e.target.value as TriggerOperator };
                        setTriggerRules(updated);
                      }}
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none"
                    >
                      <option value="lt">&lt; Less than</option>
                      <option value="lte">&le; Less or equal</option>
                      <option value="gt">&gt; Greater than</option>
                      <option value="gte">&ge; Greater or equal</option>
                      <option value="eq">== Equals</option>
                      <option value="neq">!= Not equals</option>
                      <option value="contains">Contains</option>
                      <option value="not_contains">Does not contain</option>
                    </select>
                  </div>

                  {/* Value */}
                  <div className="w-full sm:w-1/3">
                    <Input
                      placeholder="Target value"
                      value={String(rule.value)}
                      className="h-8 text-xs"
                      onChange={(e) => {
                        const updated = [...triggerRules];
                        const raw = e.target.value;
                        const num = Number(raw);
                        const val = raw !== '' && !isNaN(num) ? num : raw;
                        updated[idx] = { ...rule, value: val };
                        setTriggerRules(updated);
                      }}
                    />
                  </div>

                  {/* Delete Button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                    onClick={() => {
                      setTriggerRules(triggerRules.filter((_, i) => i !== idx));
                    }}
                    title="Remove rule"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              <div className="flex justify-start pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const defaultField = availableExtractorFields[0] || 'price';
                    setTriggerRules([...triggerRules, { field: defaultField, operator: 'lt', value: '' }]);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Condition
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-2 border-t border-border">
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
