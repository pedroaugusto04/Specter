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
      telegramChatId: row.telegramChatId,
      webhookEnabled: row.webhookEnabled,
      webhookUrl: row.webhookUrl,
      webhookSecret: decryptText(row.webhookSecret),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  entityToDto(
    entity: UserIntegrationEntity,
    botUsername: string | null
  ): UserIntegrationsDto {
    return {
      id: entity.id,
      userId: entity.userId,
      telegramEnabled: entity.telegramEnabled,
      telegramChatId: entity.telegramChatId,
      webhookEnabled: entity.webhookEnabled,
      webhookUrl: entity.webhookUrl,
      hasWebhookSecret: Boolean(entity.webhookSecret),
      botUsername,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  },

  emptyDto(userId: string, botUsername: string | null): UserIntegrationsDto {
    return {
      id: null,
      userId,
      telegramEnabled: false,
      telegramChatId: null,
      webhookEnabled: false,
      webhookUrl: null,
      hasWebhookSecret: false,
      botUsername,
      createdAt: null,
      updatedAt: null,
    };
  },
};
