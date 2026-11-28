import { logger } from '../../utils/logger.js';
import {
  type AlertPayload,
  type INotificationProvider,
  isFailureAlert,
} from './notification.interface.js';

export class ConsoleNotificationProvider implements INotificationProvider {
  public readonly name = 'console';

  async sendAlert(payload: AlertPayload): Promise<void> {
    if (isFailureAlert(payload)) {
      logger.info('Terminal failure alert dispatched (console provider)', {
        jobId: payload.jobId,
        provider: this.name,
        to: payload.to,
        subject: payload.subject,
        errorTitle: payload.errorTitle,
        errorDescription: payload.errorDescription,
        nextStep: payload.nextStep,
      });
      return;
    }

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
