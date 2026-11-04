import { validateClientCron } from './utils';

export interface JobFormData {
  url: string;
  userPrompt: string;
  notificationEmail: string;
  cronExpression: string;
}

export type JobFormField = keyof JobFormData;

export function validateUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return 'Target URL is required.';
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return 'Target URL must start with http:// or https://';
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return 'Target URL must contain a valid domain (e.g. https://example.com).';
    }
  } catch {
    return 'Target URL must be a valid URL format (e.g. https://example.com).';
  }

  return null;
}

export function validateUserPrompt(prompt: string): string | null {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return 'Extraction instructions are required.';
  }

  if (trimmed.length < 5) {
    return 'Extraction instructions must contain at least 5 characters.';
  }

  return null;
}

export function validateNotificationEmail(email?: string | null): string | null {
  if (!email) {
    return null;
  }

  const trimmed = email.trim();
  if (!trimmed) {
    return null;
  }

  // Standard RFC-5322 compatible email pattern
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    return 'Please enter a valid alert email address (e.g. alerts@company.com).';
  }

  return null;
}

export function validateCron(cronExpression: string): string | null {
  const trimmed = cronExpression.trim();
  if (!trimmed) {
    return 'Cron expression is required.';
  }

  const result = validateClientCron(trimmed);
  if (!result.valid) {
    return result.error ?? 'Invalid cron expression or interval lower than 15-minute floor.';
  }

  return null;
}

export function validateJobForm(data: JobFormData): {
  isValid: boolean;
  errors: Partial<Record<JobFormField, string>>;
} {
  const errors: Partial<Record<JobFormField, string>> = {};

  const urlError = validateUrl(data.url);
  if (urlError) errors.url = urlError;

  const emailError = validateNotificationEmail(data.notificationEmail);
  if (emailError) errors.notificationEmail = emailError;

  const promptError = validateUserPrompt(data.userPrompt);
  if (promptError) errors.userPrompt = promptError;

  const cronError = validateCron(data.cronExpression);
  if (cronError) errors.cronExpression = cronError;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
