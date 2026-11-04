import { CRON_PRESETS } from '@/lib/cronPresets';
import type {
  CreateJobRequest,
  ScrapingJobDto,
  SemanticPolicy,
  TriggerMatchMode,
  TriggerRule,
  UpdateJobRequest,
} from '@specter/contracts';
import { TriggerMatchMode as MatchMode } from '@specter/contracts';
export const DEFAULT_JOB_CRON = '0 */6 * * *';
export interface JobFormValues {
  url: string;
  userPrompt: string;
  sendEmailAlerts: boolean;
  notificationEmail: string;
  showCustomWebhook: boolean;
  webhookUrl: string;
  captureScreenshotOnChange: boolean;
  semanticPolicy: SemanticPolicy | null;
  cronPreset: string;
  customCron: string;
  useCustomCron: boolean;
  triggerRules: TriggerRule[];
  triggerMatchMode: TriggerMatchMode;
}
export function emptyJobForm(): JobFormValues {
  return {
    url: '',
    userPrompt: '',
    sendEmailAlerts: false,
    notificationEmail: '',
    showCustomWebhook: false,
    webhookUrl: '',
    captureScreenshotOnChange: false,
    semanticPolicy: null,
    cronPreset: DEFAULT_JOB_CRON,
    customCron: DEFAULT_JOB_CRON,
    useCustomCron: false,
    triggerRules: [],
    triggerMatchMode: MatchMode.All,
  };
}
export function jobToForm(job: ScrapingJobDto, email = ''): JobFormValues {
  const preset = CRON_PRESETS.some((item) => item.value === job.cronExpression);
  return {
    url: job.url,
    userPrompt: job.userPrompt,
    sendEmailAlerts: Boolean(job.notificationEmail.trim()),
    notificationEmail: job.notificationEmail || email,
    showCustomWebhook: Boolean(job.webhookUrl?.trim()),
    webhookUrl: job.webhookUrl ?? '',
    captureScreenshotOnChange: job.captureScreenshotOnChange,
    semanticPolicy: job.semanticPolicy ?? null,
    cronPreset: preset ? job.cronExpression : DEFAULT_JOB_CRON,
    customCron: job.cronExpression,
    useCustomCron: !preset,
    triggerRules: [...(job.extractionPlan?.intent.triggerRules ?? [])],
    triggerMatchMode: job.extractionPlan?.intent.triggerMatchMode ?? MatchMode.All,
  };
}
export function formToCreateJob(form: JobFormValues, fallbackEmail = ''): CreateJobRequest {
  return {
    url: form.url.trim(),
    userPrompt: form.userPrompt.trim(),
    notificationEmail: form.sendEmailAlerts ? form.notificationEmail.trim() || fallbackEmail : '',
    webhookUrl: form.showCustomWebhook ? form.webhookUrl.trim() || null : null,
    cronExpression: (form.useCustomCron ? form.customCron : form.cronPreset).trim(),
    captureScreenshotOnChange: form.captureScreenshotOnChange,
    semanticPolicy: form.semanticPolicy,
  };
}
export function formToUpdateJob(form: JobFormValues): UpdateJobRequest {
  return {
    ...formToCreateJob(form),
    triggerRules: form.triggerRules,
    triggerMatchMode: form.triggerMatchMode,
  };
}
