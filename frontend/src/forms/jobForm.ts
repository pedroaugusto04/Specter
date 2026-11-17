import { CRON_PRESETS, type CronPreset } from '@/lib/cronPresets';
import type {
  CreateJobRequest,
  ScrapingJobDto,
  TriggerMatchMode,
  TriggerRule,
  UpdateJobRequest,
} from '@specter/contracts';
import { TriggerMatchMode as MatchMode } from '@specter/contracts';
export const DEFAULT_JOB_CRON = '0 */6 * * *';
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
export function formToCreateJob(form: JobFormValues, fallbackEmail = ''): CreateJobRequest {
  return {
    name: form.name.trim(),
    url: form.url.trim(),
    userPrompt: form.userPrompt.trim(),
    notificationEmail: form.sendEmailAlerts ? form.notificationEmail.trim() || fallbackEmail : '',
    webhookUrl: form.showCustomWebhook ? form.webhookUrl.trim() || null : null,
    webhookSecret: form.showCustomWebhook ? form.webhookSecret.trim() || null : null,
    cronExpression: (form.useCustomCron ? form.customCron : form.cronPreset).trim(),
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
