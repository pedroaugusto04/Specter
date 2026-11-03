import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.js';
import { userWebSessions, type PlaywrightStorageState } from '../db/schema.js';
import { SessionMapper } from '../mappers/sessionMapper.js';
import type { UserWebSessionEntity } from '../types/domain.js';
import { extractDomainCandidates } from '../utils/urlNormalizer.js';
import { encryptJson, decryptJson } from '../utils/crypto.js';

export { extractDomainCandidates };

/**
 * Decrypts a raw DB row's storageState before passing it to the mapper.
 * Backward-compatible: plaintext jsonb is returned as-is.
 */
function decryptStorageState(raw: unknown): PlaywrightStorageState {
  return decryptJson<PlaywrightStorageState>(raw);
}

export interface UpsertSessionInput {
  domain: string;
  name: string;
  storageState: PlaywrightStorageState;
}

export interface ISessionRepository {
  findByUserAndDomain(userId: string, hostOrDomain: string): Promise<UserWebSessionEntity | null>;
  listByUserId(userId: string): Promise<UserWebSessionEntity[]>;
  findById(id: string): Promise<UserWebSessionEntity | null>;
  upsert(userId: string, input: UpsertSessionInput): Promise<UserWebSessionEntity>;
  delete(userId: string, id: string): Promise<boolean>;
}

export class DrizzleSessionRepository implements ISessionRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDb();
  }

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

    // Prefer exact match, then parent domain match
    const firstCandidate = candidates[0] ?? '';
    const exact = rows.find((r) => r.domain.toLowerCase() === firstCandidate);
    const chosen = exact ?? rows[0];
    return chosen ? SessionMapper.rowToEntity({ ...chosen, storageState: decryptStorageState(chosen.storageState) }) : null;
  }

  async listByUserId(userId: string): Promise<UserWebSessionEntity[]> {
    const rows = await this.db
      .select()
      .from(userWebSessions)
      .where(eq(userWebSessions.userId, userId))
      .orderBy(desc(userWebSessions.updatedAt));

    return rows.map((r) => SessionMapper.rowToEntity({ ...r, storageState: decryptStorageState(r.storageState) }));
  }

  async findById(id: string): Promise<UserWebSessionEntity | null> {
    const [row] = await this.db
      .select()
      .from(userWebSessions)
      .where(eq(userWebSessions.id, id))
      .limit(1);

    return row ? SessionMapper.rowToEntity({ ...row, storageState: decryptStorageState(row.storageState) }) : null;
  }

  async upsert(userId: string, input: UpsertSessionInput): Promise<UserWebSessionEntity> {
    const candidates = extractDomainCandidates(input.domain);
    const normalizedDomain = candidates[0] ?? input.domain.trim().toLowerCase();
    const cookieCount = input.storageState.cookies?.length ?? 0;
    const encryptedState = encryptJson(input.storageState);

    const existing = await this.findByUserAndDomain(userId, normalizedDomain);

    if (existing && existing.domain.toLowerCase() === normalizedDomain) {
      const [updated] = await this.db
        .update(userWebSessions)
        .set({
          name: input.name || existing.name,
          storageState: encryptedState as unknown as PlaywrightStorageState,
          cookieCount,
          updatedAt: new Date(),
        })
        .where(eq(userWebSessions.id, existing.id))
        .returning();

      return SessionMapper.rowToEntity({ ...updated!, storageState: input.storageState });
    }

    const [inserted] = await this.db
      .insert(userWebSessions)
      .values({
        userId,
        domain: normalizedDomain,
        name: input.name || normalizedDomain,
        storageState: encryptedState as unknown as PlaywrightStorageState,
        cookieCount,
      })
      .returning();

    return SessionMapper.rowToEntity({ ...inserted!, storageState: input.storageState });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(userWebSessions)
      .where(and(eq(userWebSessions.id, id), eq(userWebSessions.userId, userId)))
      .returning();

    return deleted.length > 0;
  }
}
