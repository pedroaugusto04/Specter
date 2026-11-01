import { env } from '../../config/env.js';
import { ConsoleNotificationProvider } from './consoleNotification.provider.js';
import type { INotificationProvider } from './notification.interface.js';
import { ResendNotificationProvider } from './resendNotification.provider.js';

export function createNotificationProvider(
  providerName: 'resend' | 'console' = env.NOTIFICATION_PROVIDER
): INotificationProvider {
  if (providerName === 'resend' && env.RESEND_API_KEY) {
    return new ResendNotificationProvider();
  }
  return new ConsoleNotificationProvider();
}
