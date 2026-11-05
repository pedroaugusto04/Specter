'use client';
import { FieldType, triggerOperatorsForType } from '@specter/contracts';
import { formToUpdateJob, jobToForm } from '@/forms/jobForm';
import { useJobForm } from '@/hooks/useJobForm';
import { JobScheduleFields } from './JobScheduleFields';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { useUpdateJobMutation } from '@/hooks/useDashboardQueries';
import { ApiError, type ScrapingJobDto, type TriggerOperator, type UserDto } from '@/lib/api';
import { TRIGGER_MATCH_MODE, TRIGGER_OPERATOR } from '@/lib/extractionPlan';
import { validateJobForm, type JobFormField } from '@/lib/validation';
import { AlertTriangle, Check, HelpCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
    captureScreenshotOnChange,
    cronPreset,
    customCron,
    useCustomCron,
    triggerRules,
    triggerMatchMode,
  } = values;
  const updateJobMutation = useUpdateJobMutation();
  const [showTriggerHelp, setShowTriggerHelp] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<JobFormField, string>>>({});
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (job && isOpen) {
      resetForm(jobToForm(job, user?.email));

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
    const origMode = job?.extractionPlan?.intent.triggerMatchMode ?? TRIGGER_MATCH_MODE.All;
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
      captureScreenshotOnChange !== Boolean(job.captureScreenshotOnChange) ||
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
      name: 'edit-monitor-name',
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

    setLoading(true);
    try {
      await updateJobMutation.mutateAsync({ id: job.id, payload: formToUpdateJob(values) });

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
          hint="Names must be unique across your monitors."
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
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <span>Conditional Alert Triggers</span>
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
                  onClick={() =>
                    setTriggerMatchMode(
                      triggerMatchMode === TRIGGER_MATCH_MODE.All
                        ? TRIGGER_MATCH_MODE.Any
                        : TRIGGER_MATCH_MODE.All
                    )
                  }
                  className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
                >
                  {triggerMatchMode === TRIGGER_MATCH_MODE.All ? 'ALL conditions' : 'ANY condition'}
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Info / Help Box */}
          {showTriggerHelp && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-2.5 text-xs text-muted-foreground transition-all">
              <div className="flex items-center justify-between font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  How Smart Alerts & Trigger Conditions Work
                </span>
                <button
                  type="button"
                  onClick={() => setShowTriggerHelp(false)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>

              <p className="leading-relaxed">
                By default, you receive an alert whenever any tracked content changes on the page.
                Conditional triggers let you filter notifications so you only get alerted{' '}
                <strong>when specific events occur</strong>.
              </p>

              <div className="space-y-1.5 pt-1 text-[11px]">
                <div className="font-semibold text-foreground">What you can monitor:</div>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li>
                    <strong className="text-foreground">
                      Relative variations (numbers & text):
                    </strong>{' '}
                    Get alerted if a value drops (e.g. drops by 10%, or any decrease) or if any
                    text/status changes compared to the prior check.
                  </li>
                  <li>
                    <strong className="text-foreground">Fixed target thresholds:</strong> Alert only
                    if a value passes a specific limit (e.g. less than 100 or greater than 50).
                  </li>
                  <li>
                    <strong className="text-foreground">Specific text & keyword matches:</strong>{' '}
                    Alert when a field contains or equals specific words (e.g.
                    &quot;Available&quot;, &quot;Approved&quot;, &quot;Open&quot;).
                  </li>
                </ul>
              </div>

              <div className="rounded border border-primary/25 bg-background/70 p-2.5 text-[11px] text-foreground space-y-1.5">
                <div className="font-semibold text-primary">
                  💡 Two ways to configure conditions:
                </div>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-0.5">
                  <li>
                    <strong className="text-foreground">1. In the extraction prompt:</strong> Add
                    your condition in plain text in the extraction instructions (e.g.{' '}
                    <em>&quot;Notify only if price drops by 10%&quot;</em>).
                  </li>
                  <li>
                    <strong className="text-foreground">2. Here via dropdown rules:</strong> Use the
                    conditions list below to pick detected variables, operators, and target
                    thresholds with visual controls.
                  </li>
                </ul>
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
                    const defaultField = availableExtractorFields[0];
                    if (!defaultField) return;
                    setTriggerRules([
                      ...triggerRules,
                      { field: defaultField, operator: TRIGGER_OPERATOR.Changes, value: '' },
                    ]);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Trigger Rule
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {triggerRules.map((rule, idx) => {
                const fieldType = job?.extractionPlan?.intent.fields[rule.field]?.type;
                const allowedOperators = fieldType ? triggerOperatorsForType(fieldType) : [];
                return (
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
                            updated[idx] = {
                              ...rule,
                              field: e.target.value,
                              operator: TRIGGER_OPERATOR.Changes,
                              value: '',
                            };
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
                            updated[idx] = {
                              ...rule,
                              field: e.target.value,
                              operator: TRIGGER_OPERATOR.Changes,
                              value: '',
                            };
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
                          const newOp = e.target.value as TriggerOperator;
                          updated[idx] = {
                            ...rule,
                            operator: newOp,
                            value:
                              job?.extractionPlan?.intent.fields[rule.field]?.type ===
                              FieldType.Boolean
                                ? false
                                : '',
                          };
                          setTriggerRules(updated);
                        }}
                        className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none"
                      >
                        <optgroup label="Relative Changes (vs Previous Check)">
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.PercentageDrop)}
                            value={TRIGGER_OPERATOR.PercentageDrop}
                          >
                            Drops by % or more
                          </option>
                          <option
                            disabled={
                              !allowedOperators.includes(TRIGGER_OPERATOR.PercentageIncrease)
                            }
                            value={TRIGGER_OPERATOR.PercentageIncrease}
                          >
                            Increases by % or more
                          </option>
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.Decreased)}
                            value={TRIGGER_OPERATOR.Decreased}
                          >
                            Decreased (any drop)
                          </option>
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.Increased)}
                            value={TRIGGER_OPERATOR.Increased}
                          >
                            Increased (any rise)
                          </option>
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.Changes)}
                            value={TRIGGER_OPERATOR.Changes}
                          >
                            Changed (any text or value)
                          </option>
                        </optgroup>
                        <optgroup label="Fixed Thresholds & Matches">
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.LessThan)}
                            value={TRIGGER_OPERATOR.LessThan}
                          >
                            &lt; Less than
                          </option>
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.LessThanOrEqual)}
                            value={TRIGGER_OPERATOR.LessThanOrEqual}
                          >
                            &le; Less or equal
                          </option>
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.GreaterThan)}
                            value={TRIGGER_OPERATOR.GreaterThan}
                          >
                            &gt; Greater than
                          </option>
                          <option
                            disabled={
                              !allowedOperators.includes(TRIGGER_OPERATOR.GreaterThanOrEqual)
                            }
                            value={TRIGGER_OPERATOR.GreaterThanOrEqual}
                          >
                            &ge; Greater or equal
                          </option>
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.Equal)}
                            value={TRIGGER_OPERATOR.Equal}
                          >
                            == Equals
                          </option>
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.NotEqual)}
                            value={TRIGGER_OPERATOR.NotEqual}
                          >
                            != Not equals
                          </option>
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.Contains)}
                            value={TRIGGER_OPERATOR.Contains}
                          >
                            Contains text
                          </option>
                          <option
                            disabled={!allowedOperators.includes(TRIGGER_OPERATOR.NotContains)}
                            value={TRIGGER_OPERATOR.NotContains}
                          >
                            Does not contain
                          </option>
                        </optgroup>
                      </select>
                    </div>

                    {/* Value */}
                    <div className="w-full sm:w-1/3">
                      {(
                        [
                          TRIGGER_OPERATOR.Decreased,
                          TRIGGER_OPERATOR.Increased,
                          TRIGGER_OPERATOR.Changes,
                        ] as TriggerOperator[]
                      ).includes(rule.operator) ? (
                        <div className="h-8 flex items-center px-2.5 rounded border border-input bg-muted/40 text-xs text-muted-foreground italic select-none">
                          Any change detected
                        </div>
                      ) : job?.extractionPlan?.intent.fields[rule.field]?.type ===
                        FieldType.Boolean ? (
                        <select
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                          value={String(rule.value)}
                          onChange={(e) => {
                            const updated = [...triggerRules];
                            updated[idx] = { ...rule, value: e.target.value === 'true' };
                            setTriggerRules(updated);
                          }}
                        >
                          <option value="false">False</option>
                          <option value="true">True</option>
                        </select>
                      ) : (
                        <Input
                          type={fieldType === FieldType.Number ? 'number' : 'text'}
                          step={fieldType === FieldType.Number ? 'any' : undefined}
                          placeholder={
                            (
                              [
                                TRIGGER_OPERATOR.PercentageDrop,
                                TRIGGER_OPERATOR.PercentageIncrease,
                              ] as TriggerOperator[]
                            ).includes(rule.operator)
                              ? 'Percentage (e.g. 10)'
                              : 'Target value (e.g. 150)'
                          }
                          value={String(rule.value ?? '')}
                          className="h-8 text-xs"
                          onChange={(e) => {
                            const updated = [...triggerRules];
                            const raw = e.target.value;
                            const numeric =
                              job?.extractionPlan?.intent.fields[rule.field]?.type ===
                              FieldType.Number;
                            const num = Number(raw);
                            const val =
                              numeric && raw.trim() !== '' && Number.isFinite(num) ? num : raw;
                            updated[idx] = { ...rule, value: val };
                            setTriggerRules(updated);
                          }}
                        />
                      )}
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
                );
              })}

              <div className="flex justify-start pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const defaultField = availableExtractorFields[0];
                    if (!defaultField) return;
                    setTriggerRules([
                      ...triggerRules,
                      { field: defaultField, operator: TRIGGER_OPERATOR.Changes, value: '' },
                    ]);
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
          <JobScheduleFields
            value={values}
            onChange={(schedule) => resetForm((previous) => ({ ...previous, ...schedule }))}
            onEdit={() => clearFieldError('cronExpression')}
            error={fieldErrors.cronExpression}
            prefix="edit-"
            label="Check Frequency"
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
                }
              }}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
            />
            <span className="text-sm font-medium text-foreground">
              Send notifications to a custom webhook URL
            </span>
          </label>

          {showCustomWebhook && (
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
