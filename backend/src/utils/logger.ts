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

function formatLog(level: string, message: string, context?: LogContext): string {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(redactObject(context) as LogContext),
  };
  return JSON.stringify(payload);
}

function colorizeLog(level: 'warn' | 'error', output: string): string {
  if (!env.LOG_PRETTY_CONSOLE || process.env.NO_COLOR !== undefined) return output;
  const color = level === 'warn' ? '\u001b[33m' : '\u001b[31m';
  return `${color}${output}\u001b[0m`;
}

export const logger = {
  info(message: string, context?: LogContext): void {
    if (env.LOG_LEVEL === 'silent') return;
    console.log(formatLog('info', message, context));
  },
  warn(message: string, context?: LogContext): void {
    if (env.LOG_LEVEL === 'silent') return;
    console.warn(colorizeLog('warn', formatLog('warn', message, context)));
  },
  error(message: string, context?: LogContext): void {
    if (env.LOG_LEVEL === 'silent') return;
    console.error(colorizeLog('error', formatLog('error', message, context)));
  },
  debug(message: string, context?: LogContext): void {
    if (env.LOG_LEVEL !== 'debug' && env.LOG_LEVEL !== 'trace') return;
    console.debug(formatLog('debug', message, context));
  },
};
