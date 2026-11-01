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
    ...context,
  };
  return JSON.stringify(payload);
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
