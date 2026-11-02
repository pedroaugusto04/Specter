import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { ConsoleNotificationProvider } from './consoleNotification.provider.js';
import type { INotificationProvider } from './notification.interface.js';
import { ResendNotificationProvider } from './resendNotification.provider.js';

export function createNotificationProvider(
  providerName: 'resend' | 'console' = env.NOTIFICATION_PROVIDER
): INotificationProvider {
  if (providerName === 'resend') {
    if (env.RESEND_API_KEY && env.RESEND_API_KEY !== 're_placeholder_key') {
      return new ResendNotificationProvider();
    }
    logger.warn(
      'NOTIFICATION_PROVIDER is set to "resend" but RESEND_API_KEY is missing or placeholder. Falling back to ConsoleNotificationProvider.'
    );
  }
  return new ConsoleNotificationProvider();
}
