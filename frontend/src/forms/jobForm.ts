import { CRON_PRESETS, type CronPreset } from '@/lib/cronPresets';
import type { JobFormData } from '@/lib/validation';
import type {
  CreateJobRequest,
  ScrapingJobDto,
  TriggerMatchMode,
  TriggerRule,
  UpdateJobRequest,
} from '@specter/contracts';
import { TriggerMatchMode as MatchMode } from '@specter/contracts';

export const DEFAULT_JOB_CRON = '0 */6 * * *';
export const PENDING_JOB_STORAGE_KEY = 'specter_pending_job';

export interface JobFormValues {
  name: string;
  url: string;
  userPrompt: string;
  sendEmailAlerts: boolean;
  notificationEmail: string;
  showCustomWebhook: boolean;
  webhookUrl: string;
  webhookSecret: string;
  captureScreenshotOnChange: boolean;
  cronPreset: string;
  customCron: string;
  useCustomCron: boolean;
  triggerRules: TriggerRule[];
  triggerMatchMode: TriggerMatchMode;
}

export function resolveEffectiveCron(
  form: Pick<JobFormValues, 'useCustomCron' | 'customCron' | 'cronPreset'>
): string {
  return (form.useCustomCron ? form.customCron : form.cronPreset).trim();
}

export function emptyJobForm(defaultEmail = ''): JobFormValues {
  const email = defaultEmail.trim();
  const hasEmail = Boolean(email);
  return {
    url: '',
    name: '',
    userPrompt: '',
    sendEmailAlerts: hasEmail,
    notificationEmail: email,
    showCustomWebhook: false,
    webhookUrl: '',
    webhookSecret: '',
    captureScreenshotOnChange: false,
    cronPreset: DEFAULT_JOB_CRON,
    customCron: DEFAULT_JOB_CRON,
    useCustomCron: false,
    triggerRules: [],
    triggerMatchMode: MatchMode.All,
  };
}

export function jobToForm(job: ScrapingJobDto, email = ''): JobFormValues {
  const preset = CRON_PRESETS.some((item: CronPreset) => item.value === job.cronExpression);
  return {
    url: job.url,
    name: job.name,
    userPrompt: job.userPrompt,
    sendEmailAlerts: Boolean(job.notificationEmail?.trim()),
    notificationEmail: job.notificationEmail || email,
    showCustomWebhook: Boolean(job.webhookUrl?.trim()),
    webhookUrl: job.webhookUrl ?? '',
    webhookSecret: '',
    captureScreenshotOnChange: job.captureScreenshotOnChange,
    cronPreset: preset ? job.cronExpression : DEFAULT_JOB_CRON,
    customCron: job.cronExpression,
    useCustomCron: !preset,
    triggerRules: [...(job.extractionPlan?.intent.triggerRules ?? [])],
    triggerMatchMode: job.extractionPlan?.intent.triggerMatchMode ?? MatchMode.All,
  };
}

export function formToValidationData(form: JobFormValues): JobFormData {
  return {
    name: form.name,
    url: form.url,
    userPrompt: form.userPrompt,
    notificationEmail: form.sendEmailAlerts ? form.notificationEmail : '',
    cronExpression: resolveEffectiveCron(form),
  };
}

export function formToCreateJob(form: JobFormValues, fallbackEmail = ''): CreateJobRequest {
  return {
    name: form.name.trim(),
    url: form.url.trim(),
    userPrompt: form.userPrompt.trim(),
    notificationEmail: form.sendEmailAlerts ? form.notificationEmail.trim() || fallbackEmail : '',
    webhookUrl: form.showCustomWebhook ? form.webhookUrl.trim() || null : null,
    webhookSecret: form.showCustomWebhook ? form.webhookSecret.trim() || null : null,
    cronExpression: resolveEffectiveCron(form),
    captureScreenshotOnChange: form.captureScreenshotOnChange,
  };
}

export function formToUpdateJob(
  form: JobFormValues,
  options?: { clearWebhookSecret?: boolean }
): UpdateJobRequest {
  const base = formToCreateJob(form);
  if (form.showCustomWebhook && !options?.clearWebhookSecret && !form.webhookSecret.trim()) {
    delete base.webhookSecret;
  } else if (options?.clearWebhookSecret) {
    base.webhookSecret = null;
  }
  return {
    ...base,
    triggerRules: form.triggerRules,
    triggerMatchMode: form.triggerMatchMode,
  };
}

export function isCreateJobFormDirty(
  form: JobFormValues,
  defaults: { suggestedName: string; defaultEmail: string }
): boolean {
  const defaultEmailAlerts = Boolean(defaults.defaultEmail);
  return Boolean(
    (form.name.trim().length > 0 && form.name.trim() !== defaults.suggestedName) ||
      form.url.trim().length > 0 ||
      form.userPrompt.trim().length > 0 ||
      form.sendEmailAlerts !== defaultEmailAlerts ||
      form.notificationEmail.trim() !== defaults.defaultEmail ||
      (form.showCustomWebhook &&
        (form.webhookUrl.trim().length > 0 || form.webhookSecret.trim().length > 0)) ||
      form.captureScreenshotOnChange ||
      (form.useCustomCron && form.customCron !== DEFAULT_JOB_CRON)
  );
}

export function isEditJobFormDirty(
  form: JobFormValues,
  job: ScrapingJobDto | null,
  clearWebhookSecret: boolean
): boolean {
  if (!job) return false;

  const origRules = job.extractionPlan?.intent.triggerRules ?? [];
  const origMode = job.extractionPlan?.intent.triggerMatchMode ?? MatchMode.All;
  const rulesChanged =
    form.triggerMatchMode !== origMode ||
    form.triggerRules.length !== origRules.length ||
    JSON.stringify(form.triggerRules) !== JSON.stringify(origRules);

  return (
    form.name.trim() !== job.name ||
    form.url.trim() !== job.url ||
    form.userPrompt.trim() !== job.userPrompt ||
    (form.sendEmailAlerts ? form.notificationEmail.trim() : '') !== (job.notificationEmail || '') ||
    form.sendEmailAlerts !== Boolean(job.notificationEmail.trim()) ||
    (form.showCustomWebhook ? form.webhookUrl.trim() : '') !== (job.webhookUrl ?? '') ||
    form.showCustomWebhook !== Boolean(job.webhookUrl?.trim()) ||
    Boolean(form.webhookSecret.trim()) ||
    clearWebhookSecret ||
    form.captureScreenshotOnChange !== job.captureScreenshotOnChange ||
    resolveEffectiveCron(form) !== job.cronExpression ||
    rulesChanged
  );
}

interface StoredPendingJobDraft extends Omit<CreateJobRequest, 'webhookSecret'> {
  sendEmailAlerts: boolean;
}

export function savePendingJobDraft(form: JobFormValues): void {
  try {
    const payload = formToCreateJob(form);
    const draft: StoredPendingJobDraft = {
      name: payload.name,
      url: payload.url,
      userPrompt: payload.userPrompt,
      notificationEmail: payload.notificationEmail,
      webhookUrl: payload.webhookUrl,
      cronExpression: payload.cronExpression,
      captureScreenshotOnChange: payload.captureScreenshotOnChange,
      sendEmailAlerts: form.sendEmailAlerts,
    };
    sessionStorage.setItem(PENDING_JOB_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage quota/availability errors
  }
}

export function consumePendingJobDraft(fallbackEmail: string): CreateJobRequest | null {
  try {
    const raw = sessionStorage.getItem(PENDING_JOB_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_JOB_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<StoredPendingJobDraft>;
    if (!parsed.url || !parsed.userPrompt) return null;

    const sendEmailAlerts = parsed.sendEmailAlerts ?? Boolean(parsed.notificationEmail);
    return {
      name: parsed.name,
      url: parsed.url,
      userPrompt: parsed.userPrompt,
      notificationEmail: sendEmailAlerts ? parsed.notificationEmail || fallbackEmail : '',
      webhookUrl: parsed.webhookUrl ?? null,
      cronExpression: parsed.cronExpression ?? DEFAULT_JOB_CRON,
      captureScreenshotOnChange: Boolean(parsed.captureScreenshotOnChange),
    };
  } catch {
    return null;
  }
}
