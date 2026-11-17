'use client';

import { useState } from 'react';
import type { JobFormValues } from '@/forms/jobForm';
import { validateJobForm, type JobFormField } from '@/lib/validation';

/** Validation and field feedback shared by creation and editing. */
export function useJobFormFeedback(
  values: JobFormValues,
  fallbackEmail?: string,
  fieldPrefix = ''
) {
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<JobFormField, string>>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const clearFieldError = (field: JobFormField) => {
    setFieldErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const focusFirstInvalidField = (errors: Partial<Record<JobFormField, string>>) => {
    const field = (Object.keys(errors) as JobFormField[])[0];
    if (!field) return;
    const fieldIds: Record<JobFormField, string> = {
      url: 'target-url',
      name: 'monitor-name',
      notificationEmail: 'notify-email',
      userPrompt: 'user-prompt',
      cronExpression: values.useCustomCron ? 'custom-cron' : 'cron-preset',
    };
    document.getElementById(`${fieldPrefix}${fieldIds[field]}`)?.focus();
  };

  const validateFields = (): boolean => {
    if (values.sendEmailAlerts && !values.notificationEmail.trim() && !fallbackEmail) {
      setFieldErrors((previous) => ({
        ...previous,
        notificationEmail: 'Please enter an alert email address.',
      }));
      return false;
    }
    const validation = validateJobForm({
      name: values.name,
      url: values.url,
      userPrompt: values.userPrompt,
      notificationEmail: values.sendEmailAlerts ? values.notificationEmail : '',
      cronExpression: values.useCustomCron ? values.customCron : values.cronPreset,
    });
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      focusFirstInvalidField(validation.errors);
    }
    return validation.isValid;
  };

  return {
    fieldErrors,
    setFieldErrors,
    globalError,
    setGlobalError,
    clearFieldError,
    focusFirstInvalidField,
    validateFields,
  };
}
