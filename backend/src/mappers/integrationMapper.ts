import { decryptText } from '../utils/crypto.js';
import type { UserIntegrationsDto } from '@specter/contracts';
import type { UserIntegrationRow } from '../db/schema.js';
import type { UserIntegrationEntity } from '../types/domain.js';

export const IntegrationMapper = {
  rowToEntity(row: UserIntegrationRow): UserIntegrationEntity {
    return {
      id: row.id,
      userId: row.userId,
      telegramEnabled: row.telegramEnabled,
      telegramBotToken: decryptText(row.telegramBotToken),
      telegramChatId: row.telegramChatId ?? null,
      webhookEnabled: row.webhookEnabled,
      webhookUrl: row.webhookUrl ?? null,
      webhookSecret: decryptText(row.webhookSecret),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  entityToDto(entity: UserIntegrationEntity): UserIntegrationsDto {
    return {
      id: entity.id,
      userId: entity.userId,
      telegramEnabled: entity.telegramEnabled,
      telegramChatId: entity.telegramChatId,
      webhookEnabled: entity.webhookEnabled,
      webhookUrl: entity.webhookUrl,
      hasWebhookSecret: Boolean(entity.webhookSecret),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  },

  emptyDto(userId: string): UserIntegrationsDto {
    return {
      id: null,
      userId,
      telegramEnabled: false,
      telegramChatId: null,
      webhookEnabled: false,
      webhookUrl: null,
      hasWebhookSecret: false,
      createdAt: null,
      updatedAt: null,
    };
  },
};
