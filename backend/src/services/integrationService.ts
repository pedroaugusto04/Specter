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
import { IntegrationMapper } from '../mappers/integrationMapper.js';
import type { UserIntegrationsDto } from '@specter/contracts';

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
    const botUsername = await this.getBotUsername();

    if (existing) {
      const dto = IntegrationMapper.entityToDto(existing);
      return { ...dto, botUsername };
    }

    const defaultDto = IntegrationMapper.emptyDto(userId);

    return { ...defaultDto, botUsername };
  }

  async updateIntegrations(
    userId: string,
    input: UpsertIntegrationInput
  ): Promise<UserIntegrationsDto> {
    const updated = await this.integrationRepository.upsert(userId, input);
    const botUsername = await this.getBotUsername();
    const dto = IntegrationMapper.entityToDto(updated);
    return { ...dto, botUsername };
  }

  async testTelegram(input: { chatId: string; timezone?: string }): Promise<TelegramTestResult> {
    return this.telegramProvider.sendTestMessage(input);
  }

  async testWebhook(
    input: {
      webhookUrl: string;
      secret?: string | null;
    },
    userId?: string
  ): Promise<WebhookTestResult> {
    const stored =
      userId && input.secret === undefined
        ? await this.integrationRepository.findByUserId(userId)
        : null;
    const secret =
      stored?.webhookUrl?.trim() === input.webhookUrl.trim() ? stored.webhookSecret : undefined;
    return this.webhookProvider.sendTestEvent({
      ...input,
      secret: input.secret === undefined ? secret : input.secret,
    });
  }

  async getBotUsername(): Promise<string | null> {
    return (await this.telegramProvider.getBotUsername?.()) ?? null;
  }
}
