import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const CRON_PRESETS = [
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every 1 hour', value: '0 * * * *' },
  { label: 'Every 6 hours (Default)', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at 09:00 UTC', value: '0 9 * * *' },
] as const;

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

export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(d);
  } catch {
    return isoString;
  }
}

export interface ParsedErrorMessage {
  category: 'anti-bot' | 'timeout' | 'selector' | 'generic';
  title: string;
  description: string;
}

/**
 * Parses raw error strings or exception stack dumps from database runs/jobs
 * into a structured, human-readable format, shielding users from internal stack traces.
 */
export function parseErrorMessage(rawError: string | null | undefined): ParsedErrorMessage | null {
  if (!rawError) return null;
  const raw = String(rawError).trim();
  if (!raw) return null;

  // Discard any line that looks like a stack trace or code location
  const cleanLines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        Boolean(l) &&
        !l.startsWith('at ') &&
        !l.includes('file:///') &&
        !l.includes('/app/') &&
        !l.includes('node_modules')
    );

  const firstLine = cleanLines[0] ?? '';
  const lower = (firstLine || raw).toLowerCase();

  if (
    lower.includes('anti-bot') ||
    lower.includes('account-verification') ||
    lower.includes('checkpoint') ||
    lower.includes('captcha') ||
    lower.includes('cloudflare') ||
    lower.includes('botblocked')
  ) {
    let description =
      'The target website identified automated access and required a security check.';
    if (
      lower.includes('redirect') ||
      lower.includes('redirecionamento') ||
      lower.includes('account-verification')
    ) {
      description =
        'The target website redirected to a human verification screen (CAPTCHA / checkpoint).';
    } else if (lower.includes('403') || lower.includes('429')) {
      description =
        'The target website blocked automated access (HTTP 403/429 - WAF / Cloudflare protection).';
    } else if (lower.includes('challenge') || lower.includes('desafio')) {
      description =
        'The target page presented an interactive security challenge (Cloudflare / CAPTCHA).';
    }

    return {
      category: 'anti-bot',
      title: 'Anti-Bot Block Detected',
      description,
    };
  }

  if (lower.includes('timeout') || lower.includes('tempo limite')) {
    return {
      category: 'timeout',
      title: 'Navigation Timeout',
      description: 'The target website took too long to respond and navigation timed out.',
    };
  }

  if (
    lower.includes('selector') ||
    lower.includes('incompatibilidade') ||
    lower.includes('smoke test') ||
    lower.includes('seletores')
  ) {
    return {
      category: 'selector',
      title: 'Selector Mismatch',
      description: 'Requested data was not found on the page. The site layout may have changed.',
    };
  }

  // Strip error class names (e.g. "Error: ", "TypeError: ") and file paths
  const cleaned = firstLine
    .replace(/^[A-Za-z0-9_]+Error:\s*/, '')
    .replace(/\(?file:\/\/\/[^)]*\)?/g, '')
    .replace(/\/app\/[^\s)]*/g, '')
    .replace(/[A-Za-z]:\\[^\s)]*/g, '')
    .trim();

  // If the error message was pure technical noise, show a user-friendly generic message
  const isTechnicalNoise =
    !cleaned ||
    cleaned.includes('Cannot read properties') ||
    cleaned.includes('is not a function') ||
    cleaned.includes('ECONNREFUSED') ||
    cleaned.includes('ETIMEDOUT');

  if (isTechnicalNoise) {
    return {
      category: 'generic',
      title: 'Execution Failure',
      description: 'An unexpected instability occurred while processing this request.',
    };
  }

  return {
    category: 'generic',
    title: cleaned,
    description: cleaned,
  };
}
