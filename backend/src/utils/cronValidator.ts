import cronParser from 'cron-parser';
import { env } from '../config/env.js';

export interface CronValidationResult {
  valid: boolean;
  intervalMinutes?: number;
  error?: string;
}

/**
 * Validates a 5-field cron expression and enforces the minimum interval floor (default 15 minutes).
 * Checks multiple consecutive execution gaps to prevent expressions like "0,5 * * * *" from bypassing the floor.
 */
export function validateCronFrequency(
  cronExpression: string,
  minIntervalMinutes: number = env.MIN_CRON_INTERVAL_MINUTES
): CronValidationResult {
  const trimmed = cronExpression.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length !== 5) {
    return {
      valid: false,
      error: 'Cron expression must contain exactly 5 fields (minute hour day-of-month month day-of-week).',
    };
  }

  try {
    const interval = cronParser.parseExpression(trimmed, {
      currentDate: new Date('2026-01-01T00:00:00.000Z'),
    });

    const minIntervalMs = minIntervalMinutes * 60 * 1000;
    let prevTime = interval.next().getTime();
    let smallestGapMs = Number.POSITIVE_INFINITY;

    // Sample 10 consecutive gaps to catch irregular schedules like "1,5 * * * *"
    for (let i = 0; i < 10; i++) {
      const nextTime = interval.next().getTime();
      const gapMs = nextTime - prevTime;
      if (gapMs < smallestGapMs) {
        smallestGapMs = gapMs;
      }
      prevTime = nextTime;
    }

    const intervalMinutes = Math.round(smallestGapMs / 60000);

    if (smallestGapMs < minIntervalMs) {
      return {
        valid: false,
        intervalMinutes,
        error: `Invalid cron expression or execution frequency (${intervalMinutes} min) lower than minimum allowed floor of ${minIntervalMinutes} minutes.`,
      };
    }

    return {
      valid: true,
      intervalMinutes,
    };
  } catch {
    return {
      valid: false,
      error: `Invalid cron expression or execution frequency lower than minimum allowed floor of ${minIntervalMinutes} minutes.`,
    };
  }
}
