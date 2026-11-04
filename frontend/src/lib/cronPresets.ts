export const CRON_PRESETS = [
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every 1 hour', value: '0 * * * *' },
  { label: 'Every 6 hours (Default)', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at 09:00 UTC', value: '0 9 * * *' },
] as const;
