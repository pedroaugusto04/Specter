import type { IIntegrationRepository } from '../../repositories/integrationRepository.js';
import { logger } from '../../utils/logger.js';
import type {
  AlertPayload,
  INotificationProvider,
  ITelegramNotificationProvider,
  IWebhookNotificationProvider,
} from './notification.interface.js';

export interface NotificationDispatcherDeps {
  emailProvider: INotificationProvider;
  telegramProvider: ITelegramNotificationProvider;
  webhookProvider: IWebhookNotificationProvider;
  integrationRepository: IIntegrationRepository;
}

export class NotificationDispatcher implements INotificationProvider {
  public readonly name = 'composite-dispatcher';
  public readonly emailProvider: INotificationProvider;
  public readonly telegramProvider: ITelegramNotificationProvider;
  public readonly webhookProvider: IWebhookNotificationProvider;
  public readonly integrationRepository: IIntegrationRepository;

  constructor(deps: NotificationDispatcherDeps) {
    this.emailProvider = deps.emailProvider;
    this.telegramProvider = deps.telegramProvider;
    this.webhookProvider = deps.webhookProvider;
    this.integrationRepository = deps.integrationRepository;
  }

  async sendAlert(payload: AlertPayload): Promise<void> {
    const tasks: Array<{ channel: string; run: () => Promise<void> }> = [];

    // 1. Email Channel
    if (payload.to && payload.to.trim()) {
      tasks.push({
        channel: `email(${this.emailProvider.name})`,
        run: () => this.emailProvider.sendAlert(payload),
      });
    }

    // 2. Lookup user integrations if userId is available
    let integrations = null;
    if (payload.userId) {
      try {
        integrations = await this.integrationRepository.findByUserId(payload.userId);
      } catch (err) {
        logger.warn('Failed to load user integrations for notification dispatch', {
          jobId: payload.jobId,
          userId: payload.userId,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Telegram Channel
    if (integrations?.telegramEnabled && integrations.telegramChatId) {
      const chatId = integrations.telegramChatId;
      tasks.push({
        channel: 'telegram',
        run: () => this.telegramProvider.sendAlert(payload, { chatId }),
      });
    }

    // 4. Webhook Channel (Job-specific URL takes precedence, otherwise fallback to user-level webhook)
    const targetWebhookUrl =
      payload.webhookUrl?.trim() ||
      (integrations?.webhookEnabled ? integrations.webhookUrl?.trim() : null);
    if (targetWebhookUrl) {
      const secret = integrations?.webhookSecret;
      tasks.push({
        channel: 'webhook',
        run: () =>
          this.webhookProvider.sendAlert(payload, { webhookUrl: targetWebhookUrl, secret }),
      });
    }

    if (tasks.length === 0) {
      logger.info('No notification channels configured for job alert', {
        jobId: payload.jobId,
      });
      return;
    }

    // Run all dispatches in parallel, capturing any failures without interrupting the engine
    const results = await Promise.allSettled(tasks.map((t) => t.run()));

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const task = tasks[i];
      if (res && res.status === 'rejected') {
        const err = res.reason;
        logger.warn(`Notification dispatch failed on channel "${task?.channel}"`, {
          jobId: payload.jobId,
          channel: task?.channel,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
