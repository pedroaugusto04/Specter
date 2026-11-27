'use client';

import { useState } from 'react';
import { formToValidationData, type JobFormValues } from '@/forms/jobForm';
import { extractFormError } from '@/lib/api';
import { validateJobForm, type JobFormField } from '@/lib/validation';

const JOB_FORM_FIELDS: readonly JobFormField[] = [
  'name',
  'url',
  'userPrompt',
  'notificationEmail',
  'cronExpression',
];

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
    const validation = validateJobForm(formToValidationData(values));
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      focusFirstInvalidField(validation.errors);
    }
    return validation.isValid;
  };

  const applyApiError = (error: unknown, fallbackMessage: string): boolean => {
    const extracted = extractFormError(error, JOB_FORM_FIELDS, fallbackMessage);
    const hasFieldErrors = Object.keys(extracted.fieldErrors).length > 0;
    if (hasFieldErrors) {
      setFieldErrors(extracted.fieldErrors);
      focusFirstInvalidField(extracted.fieldErrors);
    }
    setGlobalError(extracted.globalError);
    return hasFieldErrors;
  };

  return {
    fieldErrors,
    setFieldErrors,
    globalError,
    setGlobalError,
    clearFieldError,
    focusFirstInvalidField,
    validateFields,
    applyApiError,
  };
}
