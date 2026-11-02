import type { UserIntegrationRow } from '../db/schema.js';
import type { UserIntegrationEntity } from '../types/domain.js';

export interface UserIntegrationsDto {
  id: string;
  userId: string;
  telegramEnabled: boolean;
  telegramChatId: string | null;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  webhookSecret: string | null;
  botUsername?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const IntegrationMapper = {
  rowToEntity(row: UserIntegrationRow): UserIntegrationEntity {
    return {
      id: row.id,
      userId: row.userId,
      telegramEnabled: row.telegramEnabled,
      telegramBotToken: row.telegramBotToken ?? null,
      telegramChatId: row.telegramChatId ?? null,
      webhookEnabled: row.webhookEnabled,
      webhookUrl: row.webhookUrl ?? null,
      webhookSecret: row.webhookSecret ?? null,
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
      webhookSecret: entity.webhookSecret,
      createdAt:
        entity.createdAt instanceof Date
          ? entity.createdAt.toISOString()
          : String(entity.createdAt),
      updatedAt:
        entity.updatedAt instanceof Date
          ? entity.updatedAt.toISOString()
          : String(entity.updatedAt),
    };
  },

  rowToDto(row: UserIntegrationRow): UserIntegrationsDto {
    return IntegrationMapper.entityToDto(IntegrationMapper.rowToEntity(row));
  },
};
