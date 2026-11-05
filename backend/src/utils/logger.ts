/* eslint-disable no-console */
import { redactObject } from '../extraction/evidence.js';
import { env } from '../config/env.js';

export interface LogContext {
  jobId?: string;
  durationMs?: number;
  errorCode?: string;
  httpStatus?: number;
  provider?: string;
  [key: string]: unknown;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  white: '\u001b[37m',
} as const;

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

function colorize(text: string, color: string, enabled: boolean): string {
  return enabled ? `${color}${text}${ANSI.reset}` : text;
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(redactObject(context) as LogContext),
  };
  const pretty = env.LOG_PRETTY_CONSOLE;
  if (process.env.NODE_ENV === 'production' && !pretty) return JSON.stringify(entry);

  const colorEnabled = pretty && process.env.NO_COLOR === undefined;
  const levelColor =
    level === 'error'
      ? ANSI.red
      : level === 'warn'
        ? ANSI.yellow
        : level === 'info'
          ? ANSI.green
          : ANSI.cyan;
  const extras = Object.fromEntries(
    Object.entries(entry).filter(
      ([key, value]) => !['timestamp', 'level', 'message'].includes(key) && value !== undefined
    )
  );
  const line = [
    entry.timestamp,
    colorize(LEVEL_LABELS[level], levelColor, colorEnabled),
    colorize(message, ANSI.white, colorEnabled),
  ];
  if (Object.keys(extras).length)
    line.push(colorize(JSON.stringify(extras), ANSI.dim, colorEnabled));
  return line.join(' | ');
}

export const logger = {
  info(message: string, context?: LogContext): void {
    if (env.LOG_LEVEL === 'silent') return;
    console.log(formatLog('info', message, context));
  },
  warn(message: string, context?: LogContext): void {
    if (env.LOG_LEVEL === 'silent') return;
    console.warn(formatLog('warn', message, context));
  },
  error(message: string, context?: LogContext): void {
    if (env.LOG_LEVEL === 'silent') return;
    console.error(formatLog('error', message, context));
  },
  debug(message: string, context?: LogContext): void {
    if (env.LOG_LEVEL !== 'debug' && env.LOG_LEVEL !== 'trace') return;
    console.debug(formatLog('debug', message, context));
  },
};
