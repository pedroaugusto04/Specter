import { eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.js';
import { userIntegrations, type UserIntegrationRow } from '../db/schema.js';
import type { UserIntegrationEntity } from '../types/domain.js';

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

export function integrationRowToEntity(row: UserIntegrationRow): UserIntegrationEntity {
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

    return row ? integrationRowToEntity(row) : null;
  }

  async upsert(userId: string, input: UpsertIntegrationInput): Promise<UserIntegrationEntity> {
    const existing = await this.findByUserId(userId);

    if (existing) {
      const [updated] = await this.db
        .update(userIntegrations)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(userIntegrations.userId, userId))
        .returning();

      return integrationRowToEntity(updated!);
    }

    const [inserted] = await this.db
      .insert(userIntegrations)
      .values({
        userId,
        telegramEnabled: input.telegramEnabled ?? false,
        telegramBotToken: input.telegramBotToken ?? null,
        telegramChatId: input.telegramChatId ?? null,
        webhookEnabled: input.webhookEnabled ?? false,
        webhookUrl: input.webhookUrl ?? null,
        webhookSecret: input.webhookSecret ?? null,
      })
      .returning();

    return integrationRowToEntity(inserted!);
  }
}
