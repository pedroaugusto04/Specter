import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { userWebSessions } from '../db/schema.js';
import { PersistenceError } from '../errors/domainErrors.js';
import type { PlaywrightStorageState } from '../types/session.js';
import { SessionMapper } from '../mappers/sessionMapper.js';
import type { UserWebSessionEntity } from '../types/domain.js';
import { extractDomainCandidates } from '../utils/urlNormalizer.js';
import { encryptJson } from '../utils/crypto.js';

export interface UpsertSessionInput {
  domain: string;
  name: string;
  storageState: PlaywrightStorageState;
}

export interface ISessionRepository {
  findByUserAndDomain(userId: string, hostOrDomain: string): Promise<UserWebSessionEntity | null>;
  listPageByUserId(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ items: UserWebSessionEntity[]; totalItems: number }>;
  upsert(userId: string, input: UpsertSessionInput): Promise<UserWebSessionEntity>;
  delete(userId: string, id: string): Promise<boolean>;
}

export class DrizzleSessionRepository implements ISessionRepository {
  constructor(private readonly db: Database) {}

  async findByUserAndDomain(
    userId: string,
    hostOrDomain: string
  ): Promise<UserWebSessionEntity | null> {
    const candidates = extractDomainCandidates(hostOrDomain);
    if (candidates.length === 0) return null;

    const rows = await this.db
      .select()
      .from(userWebSessions)
      .where(and(eq(userWebSessions.userId, userId), inArray(userWebSessions.domain, candidates)))
      .orderBy(desc(userWebSessions.updatedAt));

    if (rows.length === 0) return null;

    const exact = rows.find((row) => row.domain.toLowerCase() === candidates[0]);
    return SessionMapper.rowToEntity(exact ?? rows[0]!);
  }

  async listPageByUserId(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ items: UserWebSessionEntity[]; totalItems: number }> {
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(userWebSessions)
        .where(eq(userWebSessions.userId, userId))
        .orderBy(desc(userWebSessions.updatedAt), desc(userWebSessions.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(userWebSessions)
        .where(eq(userWebSessions.userId, userId)),
    ]);
    return {
      items: rows.map(SessionMapper.rowToEntity),
      totalItems: total?.value ?? 0,
    };
  }

  async upsert(userId: string, input: UpsertSessionInput): Promise<UserWebSessionEntity> {
    const candidates = extractDomainCandidates(input.domain);
    const normalizedDomain = candidates[0] ?? input.domain.trim().toLowerCase();
    const cookieCount = input.storageState.cookies.length;
    const encryptedState = encryptJson(input.storageState);

    const existing = await this.findByUserAndDomain(userId, normalizedDomain);

    if (existing && existing.domain.toLowerCase() === normalizedDomain) {
      const [updated] = await this.db
        .update(userWebSessions)
        .set({
          name: input.name || existing.name,
          storageState: encryptedState,
          cookieCount,
          updatedAt: new Date(),
        })
        .where(eq(userWebSessions.id, existing.id))
        .returning();

      if (!updated) throw new PersistenceError('update web session');
      return SessionMapper.rowToEntity(updated);
    }

    const [inserted] = await this.db
      .insert(userWebSessions)
      .values({
        userId,
        domain: normalizedDomain,
        name: input.name || normalizedDomain,
        storageState: encryptedState,
        cookieCount,
      })
      .returning();

    if (!inserted) throw new PersistenceError('insert web session');
    return SessionMapper.rowToEntity(inserted);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(userWebSessions)
      .where(and(eq(userWebSessions.id, id), eq(userWebSessions.userId, userId)))
      .returning({ id: userWebSessions.id });

    return deleted.length > 0;
  }
}
