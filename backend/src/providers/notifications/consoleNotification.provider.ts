import { logger } from '../../utils/logger.js';
import type { AlertPayload, INotificationProvider } from './notification.interface.js';

export class ConsoleNotificationProvider implements INotificationProvider {
  public readonly name = 'console';

  async sendAlert(payload: AlertPayload): Promise<void> {
    logger.info('Notification alert dispatched (console provider)', {
      jobId: payload.jobId,
      provider: this.name,
      to: payload.to,
      subject: payload.subject,
      totalChanges: payload.diffSummary.totalChanges,
      summary: payload.diffSummary.summaryText,
    });
  }
}
