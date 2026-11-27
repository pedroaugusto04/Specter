import { getUserFailure } from '@specter/contracts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function validateClientCron(cronExpression: string): { valid: boolean; error?: string } {
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length !== 5) {
    return {
      valid: false,
      error: 'Cron expression must contain exactly 5 fields (e.g. "0 */6 * * *").',
    };
  }

  const minuteField = parts[0]!;

  if (minuteField === '*') {
    return {
      valid: false,
      error: 'Execution every minute violates the 15-minute minimum interval floor.',
    };
  }

  const stepMatch = /^\*\/(\d+)$/.exec(minuteField);
  if (stepMatch) {
    const step = Number(stepMatch[1]);
    if (step < 15) {
      return {
        valid: false,
        error: `Interval of ${step} minutes is below the 15-minute floor.`,
      };
    }
  }

  if (minuteField.includes(',')) {
    const nums = minuteField
      .split(',')
      .map((n) => Number(n.trim()))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) {
      if (nums[i]! - nums[i - 1]! < 15) {
        return {
          valid: false,
          error: 'Specified minutes contain gaps smaller than the 15-minute floor.',
        };
      }
    }
  }

  return { valid: true };
}

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone.trim() || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const COMMON_TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'America/Sao Paulo (BRT / UTC-3)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New York (EST/EDT)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST/CDT)' },
  { value: 'America/Denver', label: 'America/Denver (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (PST/PDT)' },
  { value: 'America/Buenos_Aires', label: 'America/Buenos Aires (ART)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Lisbon', label: 'Europe/Lisbon (WET/WEST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (CST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
] as const;

export interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
  city: string;
}

let cachedTimezones: TimezoneOption[] | null = null;

export function getAllIanaTimezones(): TimezoneOption[] {
  if (cachedTimezones) return cachedTimezones;

  let timezones: string[] = [];

  if ('supportedValuesOf' in Intl && typeof Intl.supportedValuesOf === 'function') {
    try {
      timezones = Intl.supportedValuesOf('timeZone');
    } catch {
      timezones = [];
    }
  }

  if (timezones.length === 0) {
    timezones = COMMON_TIMEZONES.map((t) => t.value);
  }

  if (!timezones.includes('UTC')) timezones.unshift('UTC');
  if (!timezones.includes(DEFAULT_TIMEZONE)) timezones.unshift(DEFAULT_TIMEZONE);

  const now = new Date();
  const results: TimezoneOption[] = [];

  for (const tz of timezones) {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      });
      const parts = formatter.formatToParts(now);
      const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
      const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
      results.push({
        value: tz,
        label: `${tz} (${tzPart})`,
        offset: tzPart,
        city,
      });
    } catch {
      // Unsupported timezone in host environment, skip
    }
  }

  cachedTimezones = results;
  return results;
}

function formatWithTimezone(
  isoString: string,
  options: Intl.DateTimeFormatOptions,
  timeZone: string
): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
}

export function formatDateTime(isoString: string, timeZone: string = getBrowserTimezone()): string {
  return formatWithTimezone(
    isoString,
    { dateStyle: 'medium', timeStyle: 'medium' },
    timeZone
  );
}

export function formatCompactDate(
  isoString: string,
  timeZone: string = getBrowserTimezone()
): string {
  return formatWithTimezone(
    isoString,
    {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
    timeZone
  );
}

export function parseErrorMessage(rawError: string | null | undefined) {
  if (!rawError) return null;
  return getUserFailure(rawError);
}
