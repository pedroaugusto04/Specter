import {
  type IIntegrationRepository,
  type UpsertIntegrationInput,
} from '../repositories/integrationRepository.js';
import type {
  ITelegramNotificationProvider,
  IWebhookNotificationProvider,
  TelegramTestResult,
  WebhookTestResult,
} from '../providers/notifications/notification.interface.js';
import {
  IntegrationMapper,
  type UserIntegrationsDto,
} from '../mappers/integrationMapper.js';

export class IntegrationService {
  private readonly integrationRepository: IIntegrationRepository;
  private readonly telegramProvider: ITelegramNotificationProvider;
  private readonly webhookProvider: IWebhookNotificationProvider;

  constructor(
    integrationRepository: IIntegrationRepository,
    telegramProvider: ITelegramNotificationProvider,
    webhookProvider: IWebhookNotificationProvider
  ) {
    this.integrationRepository = integrationRepository;
    this.telegramProvider = telegramProvider;
    this.webhookProvider = webhookProvider;
  }

  async getIntegrations(userId: string): Promise<UserIntegrationsDto> {
    const existing = await this.integrationRepository.findByUserId(userId);
    if (existing) {
      return IntegrationMapper.entityToDto(existing);
    }

    return IntegrationMapper.entityToDto({
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
    });
  }

  async updateIntegrations(
    userId: string,
    input: UpsertIntegrationInput
  ): Promise<UserIntegrationsDto> {
    const updated = await this.integrationRepository.upsert(userId, input);
    return IntegrationMapper.entityToDto(updated);
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
