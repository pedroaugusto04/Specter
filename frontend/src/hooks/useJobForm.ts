'use client';
import { emptyJobForm, type JobFormValues } from '@/forms/jobForm';
import type { SetStateAction } from 'react';
import { useCallback, useMemo, useState } from 'react';
export function useJobForm() {
  const [values, reset] = useState(emptyJobForm);
  const setField = useCallback(
    <K extends keyof JobFormValues>(key: K, action: SetStateAction<JobFormValues[K]>) => {
      reset((previous) => ({
        ...previous,
        [key]:
          typeof action === 'function'
            ? (action as (value: JobFormValues[K]) => JobFormValues[K])(previous[key])
            : action,
      }));
    },
    []
  );
  const setters = useMemo(
    () => ({
      setUrl: (value: SetStateAction<string>) => setField('url', value),
      setName: (value: SetStateAction<string>) => setField('name', value),
      setUserPrompt: (value: SetStateAction<string>) => setField('userPrompt', value),
      setSendEmailAlerts: (value: SetStateAction<boolean>) => setField('sendEmailAlerts', value),
      setNotificationEmail: (value: SetStateAction<string>) => setField('notificationEmail', value),
      setShowCustomWebhook: (value: SetStateAction<boolean>) =>
        setField('showCustomWebhook', value),
      setWebhookUrl: (value: SetStateAction<string>) => setField('webhookUrl', value),
      setWebhookSecret: (value: SetStateAction<string>) => setField('webhookSecret', value),
      setCaptureScreenshotOnChange: (value: SetStateAction<boolean>) =>
        setField('captureScreenshotOnChange', value),
      setTriggerRules: (value: SetStateAction<JobFormValues['triggerRules']>) =>
        setField('triggerRules', value),
      setTriggerMatchMode: (value: SetStateAction<JobFormValues['triggerMatchMode']>) =>
        setField('triggerMatchMode', value),
    }),
    [setField]
  );
  return { values, reset, ...setters };
}
