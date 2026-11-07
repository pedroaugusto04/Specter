import { getUserFailure } from '@specter/contracts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export { CRON_PRESETS } from './cronPresets';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function validateClientCron(cronExpression: string): { valid: boolean; error?: string } {
  const trimmed = cronExpression.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length !== 5) {
    return {
      valid: false,
      error: 'Cron expression must contain exactly 5 fields (e.g. "0 */6 * * *").',
    };
  }

  const minuteField = parts[0] ?? '';

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
      if ((nums[i] ?? 0) - (nums[i - 1] ?? 0) < 15) {
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

export const COMMON_TIMEZONES = [
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

export function formatDateTime(isoString: string, timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone,
    }).format(d);
  } catch {
    try {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(isoString));
    } catch {
      return isoString;
    }
  }
}

export function formatCompactDate(isoString: string, timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }).format(d);
  } catch {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(isoString));
    } catch {
      return isoString;
    }
  }
}

export function parseErrorMessage(rawError: string | null | undefined) {
  if (!rawError) return null;
  return getUserFailure(rawError);
}
