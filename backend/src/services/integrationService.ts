import type { UserIntegrationsDto } from '@specter/contracts';
import { TelegramTestFailedError, WebhookTestFailedError } from '../errors/domainErrors.js';
import { IntegrationMapper } from '../mappers/integrationMapper.js';
import type {
  ITelegramNotificationProvider,
  IWebhookNotificationProvider,
} from '../providers/notifications/notification.interface.js';
import type {
  IIntegrationRepository,
  UpsertIntegrationInput,
} from '../repositories/integrationRepository.js';

export class IntegrationService {
  constructor(
    private readonly integrationRepository: IIntegrationRepository,
    private readonly telegramProvider: ITelegramNotificationProvider,
    private readonly webhookProvider: IWebhookNotificationProvider
  ) {}

  async getIntegrations(userId: string): Promise<UserIntegrationsDto> {
    const [existing, botUsername] = await Promise.all([
      this.integrationRepository.findByUserId(userId),
      this.getBotUsername(),
    ]);

    return existing
      ? IntegrationMapper.entityToDto(existing, botUsername)
      : IntegrationMapper.emptyDto(userId, botUsername);
  }

  async updateIntegrations(
    userId: string,
    input: UpsertIntegrationInput
  ): Promise<UserIntegrationsDto> {
    const [updated, botUsername] = await Promise.all([
      this.integrationRepository.upsert(userId, input),
      this.getBotUsername(),
    ]);
    return IntegrationMapper.entityToDto(updated, botUsername);
  }

  async testTelegram(input: { chatId: string; timezone?: string }): Promise<void> {
    const result = await this.telegramProvider.sendTestMessage(input);
    if (!result.ok) {
      throw new TelegramTestFailedError(result.error);
    }
  }

  async testWebhook(
    input: {
      webhookUrl: string;
      secret?: string | null;
    },
    userId: string
  ): Promise<void> {
    const stored =
      input.secret === undefined ? await this.integrationRepository.findByUserId(userId) : null;
    const resolvedSecret =
      input.secret !== undefined
        ? input.secret
        : stored?.webhookUrl?.trim() === input.webhookUrl.trim()
          ? stored.webhookSecret
          : undefined;

    const result = await this.webhookProvider.sendTestEvent({
      webhookUrl: input.webhookUrl,
      secret: resolvedSecret,
    });
    if (!result.ok) {
      throw new WebhookTestFailedError(result.error, result.status);
    }
  }

  async getBotUsername(): Promise<string | null> {
    return this.telegramProvider.getBotUsername();
  }
}
