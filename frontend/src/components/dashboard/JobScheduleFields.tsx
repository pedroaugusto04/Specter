'use client';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { DEFAULT_JOB_CRON, type JobFormValues } from '@/forms/jobForm';
import { cn, CRON_PRESETS } from '@/lib/utils';
const CUSTOM_SCHEDULE = 'custom';
type Schedule = Pick<JobFormValues, 'cronPreset' | 'customCron' | 'useCustomCron'>;
export function JobScheduleFields({
  value,
  onChange,
  onEdit,
  error,
  prefix = '',
  label = 'Monitoring Frequency',
}: {
  value: Schedule;
  onChange(value: Schedule): void;
  onEdit(): void;
  error?: string;
  prefix?: string;
  label?: string;
}) {
  const presetId = `${prefix}cron-preset`;
  const customId = `${prefix}custom-cron`;
  return (
    <>
      <FormField
        label={label}
        hint="Scheduled times use the timezone in your profile."
        htmlFor={presetId}
        required
        error={!value.useCustomCron ? error : undefined}
      >
        <select
          id={presetId}
          aria-invalid={!value.useCustomCron && Boolean(error)}
          aria-describedby={!value.useCustomCron && error ? `${presetId}-error` : undefined}
          className={cn(
            'flex h-10 w-full rounded-md border bg-background px-3.5 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground',
            !value.useCustomCron && error ? 'border-red-600' : 'border-input'
          )}
          value={value.useCustomCron ? CUSTOM_SCHEDULE : value.cronPreset}
          onChange={(event) => {
            onEdit();
            onChange(
              event.target.value === CUSTOM_SCHEDULE
                ? { ...value, useCustomCron: true }
                : {
                    cronPreset: event.target.value,
                    customCron: event.target.value,
                    useCustomCron: false,
                  }
            );
          }}
        >
          {CRON_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label} ({preset.value})
            </option>
          ))}
          <option value={CUSTOM_SCHEDULE}>Custom Cron Expression...</option>
        </select>
      </FormField>
      {value.useCustomCron && (
        <FormField
          label="Custom Cron Expression (min. 15m)"
          htmlFor={customId}
          required
          error={error}
          hint="5 space-delimited fields: minute hour day month weekday."
        >
          <Input
            id={customId}
            placeholder={DEFAULT_JOB_CRON}
            value={value.customCron}
            hasError={Boolean(error)}
            aria-describedby={error ? `${customId}-error` : undefined}
            className="font-mono text-sm"
            onChange={(event) => {
              onChange({ ...value, customCron: event.target.value });
              onEdit();
            }}
          />
        </FormField>
      )}
    </>
  );
}
