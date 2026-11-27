import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { userIntegrations } from '../db/schema.js';
import { PersistenceError } from '../errors/domainErrors.js';
import { IntegrationMapper } from '../mappers/integrationMapper.js';
import type { UserIntegrationEntity } from '../types/domain.js';
import { encryptText } from '../utils/crypto.js';

export interface UpsertIntegrationInput {
  telegramEnabled?: boolean;
  telegramChatId?: string | null;
  webhookEnabled?: boolean;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
}

export interface IIntegrationRepository {
  findByUserId(userId: string): Promise<UserIntegrationEntity | null>;
  upsert(userId: string, input: UpsertIntegrationInput): Promise<UserIntegrationEntity>;
}

export class DrizzleIntegrationRepository implements IIntegrationRepository {
  constructor(private readonly db: Database) {}

  async findByUserId(userId: string): Promise<UserIntegrationEntity | null> {
    const [row] = await this.db
      .select()
      .from(userIntegrations)
      .where(eq(userIntegrations.userId, userId))
      .limit(1);

    return row ? IntegrationMapper.rowToEntity(row) : null;
  }

  async upsert(userId: string, input: UpsertIntegrationInput): Promise<UserIntegrationEntity> {
    const encryptedWebhookSecret =
      input.webhookSecret !== undefined
        ? input.webhookSecret !== null
          ? encryptText(input.webhookSecret)
          : null
        : undefined;

    const updateSet = {
      ...(input.telegramEnabled !== undefined ? { telegramEnabled: input.telegramEnabled } : {}),
      ...(input.telegramChatId !== undefined ? { telegramChatId: input.telegramChatId } : {}),
      ...(input.webhookEnabled !== undefined ? { webhookEnabled: input.webhookEnabled } : {}),
      ...(input.webhookUrl !== undefined ? { webhookUrl: input.webhookUrl } : {}),
      ...(encryptedWebhookSecret !== undefined ? { webhookSecret: encryptedWebhookSecret } : {}),
      updatedAt: new Date(),
    };

    const [row] = await this.db
      .insert(userIntegrations)
      .values({
        userId,
        telegramEnabled: input.telegramEnabled ?? false,
        telegramChatId: input.telegramChatId ?? null,
        webhookEnabled: input.webhookEnabled ?? false,
        webhookUrl: input.webhookUrl ?? null,
        webhookSecret: encryptedWebhookSecret ?? null,
      })
      .onConflictDoUpdate({
        target: userIntegrations.userId,
        set: updateSet,
      })
      .returning();

    if (!row) {
      throw new PersistenceError('upsert user integrations');
    }

    return IntegrationMapper.rowToEntity(row);
  }
}
