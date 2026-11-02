import {
  type IIntegrationRepository,
  type UpsertIntegrationInput,
} from '../repositories/integrationRepository.js';
import {
  TelegramNotificationProvider,
  type TelegramTestResult,
} from '../providers/notifications/telegramNotification.provider.js';
import {
  WebhookNotificationProvider,
  type WebhookTestResult,
} from '../providers/notifications/webhookNotification.provider.js';
import type { UserIntegrationEntity } from '../types/domain.js';

export class IntegrationService {
  private readonly integrationRepository: IIntegrationRepository;
  private readonly telegramProvider: TelegramNotificationProvider;
  private readonly webhookProvider: WebhookNotificationProvider;

  constructor(
    integrationRepository: IIntegrationRepository,
    telegramProvider?: TelegramNotificationProvider,
    webhookProvider?: WebhookNotificationProvider
  ) {
    this.integrationRepository = integrationRepository;
    this.telegramProvider = telegramProvider ?? new TelegramNotificationProvider();
    this.webhookProvider = webhookProvider ?? new WebhookNotificationProvider();
  }

  async getIntegrations(userId: string): Promise<UserIntegrationEntity> {
    const existing = await this.integrationRepository.findByUserId(userId);
    if (existing) {
      return existing;
    }

    return {
      id: '',
      userId,
      telegramEnabled: false,
      telegramBotToken: null,
      telegramChatId: null,
      webhookEnabled: false,
      webhookUrl: null,
      webhookSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async updateIntegrations(
    userId: string,
    input: UpsertIntegrationInput
  ): Promise<UserIntegrationEntity> {
    return this.integrationRepository.upsert(userId, input);
  }

  async testTelegram(input: {
    chatId: string;
  }): Promise<TelegramTestResult> {
    return this.telegramProvider.sendTestMessage(input);
  }

  async testWebhook(input: {
    webhookUrl: string;
    secret?: string | null;
  }): Promise<WebhookTestResult> {
    return this.webhookProvider.sendTestEvent(input);
  }
}
