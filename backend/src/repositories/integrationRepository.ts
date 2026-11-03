import { eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.js';
import { userIntegrations } from '../db/schema.js';
import { IntegrationMapper } from '../mappers/integrationMapper.js';
import type { UserIntegrationEntity } from '../types/domain.js';
import { encryptText, decryptText } from '../utils/crypto.js';

export interface UpsertIntegrationInput {
  telegramEnabled?: boolean;
  telegramBotToken?: string | null;
  telegramChatId?: string | null;
  webhookEnabled?: boolean;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
}

export interface IIntegrationRepository {
  findByUserId(userId: string): Promise<UserIntegrationEntity | null>;
  upsert(userId: string, input: UpsertIntegrationInput): Promise<UserIntegrationEntity>;
}

export const integrationRowToEntity = IntegrationMapper.rowToEntity;

/**
 * Decrypts sensitive fields from a raw DB row before mapping to entity.
 */
function decryptIntegrationRow<T extends { telegramBotToken: string | null; webhookSecret: string | null }>(
  row: T
): T {
  return {
    ...row,
    telegramBotToken: decryptText(row.telegramBotToken),
    webhookSecret: decryptText(row.webhookSecret),
  };
}

export class DrizzleIntegrationRepository implements IIntegrationRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDb();
  }

  async findByUserId(userId: string): Promise<UserIntegrationEntity | null> {
    const [row] = await this.db
      .select()
      .from(userIntegrations)
      .where(eq(userIntegrations.userId, userId))
      .limit(1);

    return row ? integrationRowToEntity(decryptIntegrationRow(row)) : null;
  }

  async upsert(userId: string, input: UpsertIntegrationInput): Promise<UserIntegrationEntity> {
    const existing = await this.findByUserId(userId);

    // Encrypt sensitive fields before persisting
    const encryptedInput = {
      ...input,
      telegramBotToken: input.telegramBotToken != null ? encryptText(input.telegramBotToken) : input.telegramBotToken,
      webhookSecret: input.webhookSecret != null ? encryptText(input.webhookSecret) : input.webhookSecret,
    };

    if (existing) {
      const [updated] = await this.db
        .update(userIntegrations)
        .set({
          ...encryptedInput,
          updatedAt: new Date(),
        })
        .where(eq(userIntegrations.userId, userId))
        .returning();

      return integrationRowToEntity(decryptIntegrationRow(updated!));
    }

    const [inserted] = await this.db
      .insert(userIntegrations)
      .values({
        userId,
        telegramEnabled: encryptedInput.telegramEnabled ?? false,
        telegramBotToken: encryptedInput.telegramBotToken ?? null,
        telegramChatId: encryptedInput.telegramChatId ?? null,
        webhookEnabled: encryptedInput.webhookEnabled ?? false,
        webhookUrl: encryptedInput.webhookUrl ?? null,
        webhookSecret: encryptedInput.webhookSecret ?? null,
      })
      .returning();

    return integrationRowToEntity(decryptIntegrationRow(inserted!));
  }
}
