import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const CRON_PRESETS = [
  { label: 'Every 15 minutes (Minimum floor)', value: '*/15 * * * *' },
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

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export interface ParsedError {
  title: string;
  description: string;
  category: 'anti-bot' | 'timeout' | 'selector' | 'validation' | 'generic';
  technicalDetails?: string;
}

/**
 * Parses raw error strings (which may contain Node stack traces or internal URLs)
 * into a clear, transparent, and user-friendly structured message.
 */
export function parseErrorMessage(raw: string | null | undefined): ParsedError | null {
  if (!raw || !raw.trim()) return null;

  const text = raw.trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] ?? text;

  // Extract stack trace or file path lines if present
  const hasStack = lines.some((l) => l.startsWith('at ') || l.includes('file:///') || l.includes('/app/'));
  const technicalDetails = hasStack ? text : undefined;

  const lower = firstLine.toLowerCase();

  if (
    lower.includes('anti-bot') ||
    lower.includes('account-verification') ||
    lower.includes('checkpoint') ||
    lower.includes('captcha') ||
    lower.includes('cloudflare') ||
    lower.includes('botblocked')
  ) {
    let description = 'O site de destino identificou a requisição automatizada e exigiu verificação de segurança.';
    if (lower.includes('redirecionamento') || lower.includes('account-verification')) {
      description = 'O site redirecionou para uma tela de verificação humana (CAPTCHA / conta).';
    } else if (lower.includes('403') || lower.includes('429')) {
      description = 'O site bloqueou o acesso automatizado (HTTP 403/429 - Proteção WAF / Cloudflare).';
    } else if (lower.includes('conteúdo') || lower.includes('desafio')) {
      description = 'A página apresentou um desafio interativo de segurança (Cloudflare / CAPTCHA).';
    }

    return {
      category: 'anti-bot',
      title: 'Bloqueio Anti-Bot Detectado',
      description,
      technicalDetails,
    };
  }

  if (lower.includes('timeout') || lower.includes('tempo limite')) {
    return {
      category: 'timeout',
      title: 'Tempo Limite Esgotado',
      description: 'O site demorou muito para responder e a navegação excedeu o tempo limite configurado.',
      technicalDetails,
    };
  }

  if (lower.includes('selector') || lower.includes('incompatibilidade') || lower.includes('smoke test') || lower.includes('seletores')) {
    return {
      category: 'selector',
      title: 'Incompatibilidade de Seletores',
      description: 'Os dados não foram encontrados na página atual. O layout do site pode ter sido modificado.',
      technicalDetails,
    };
  }

  // Generic fallback: clean technical noise from title
  const cleaned = firstLine
    .replace(/^[A-Za-z0-9_]+Error:\s*/, '')
    .replace(/\(?file:\/\/\/[^)]*\)?/g, '')
    .replace(/\/app\/[^\s)]*/g, '')
    .replace(/[A-Za-z]:\\[^\s)]*/g, '')
    .trim();

  return {
    category: 'generic',
    title: cleaned || 'Falha na Execução',
    description: cleaned || 'Ocorreu um erro durante o processamento do monitor.',
    technicalDetails,
  };
}
