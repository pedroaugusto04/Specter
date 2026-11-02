import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.js';
import {
  userWebSessions,
  type PlaywrightStorageState,
  type UserWebSessionRow,
} from '../db/schema.js';

export interface UpsertSessionInput {
  domain: string;
  name: string;
  storageState: PlaywrightStorageState;
}

export interface ISessionRepository {
  findByUserAndDomain(userId: string, hostOrDomain: string): Promise<UserWebSessionRow | null>;
  listByUserId(userId: string): Promise<UserWebSessionRow[]>;
  findById(id: string): Promise<UserWebSessionRow | null>;
  upsert(userId: string, input: UpsertSessionInput): Promise<UserWebSessionRow>;
  delete(userId: string, id: string): Promise<boolean>;
}

export function extractDomainCandidates(hostname: string): string[] {
  const withoutProtocol = hostname.trim().toLowerCase().replace(/^https?:\/\//, '');
  const firstSlash = withoutProtocol.split('/')[0] ?? '';
  const clean = firstSlash.split(':')[0] ?? '';
  if (!clean) return [];

  const candidates: string[] = [clean];
  const parts = clean.split('.');

  // If host is sub.domain.com, candidates are ['sub.domain.com', 'domain.com']
  if (parts.length > 2) {
    const rootDomain = parts.slice(-2).join('.');
    if (!candidates.includes(rootDomain)) {
      candidates.push(rootDomain);
    }
  }

  return candidates;
}

export class DrizzleSessionRepository implements ISessionRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDb();
  }

  async findByUserAndDomain(userId: string, hostOrDomain: string): Promise<UserWebSessionRow | null> {
    const candidates = extractDomainCandidates(hostOrDomain);
    if (candidates.length === 0) return null;

    const rows = await this.db
      .select()
      .from(userWebSessions)
      .where(
        and(
          eq(userWebSessions.userId, userId),
          inArray(userWebSessions.domain, candidates)
        )
      )
      .orderBy(desc(userWebSessions.updatedAt));

    if (rows.length === 0) return null;

    // Prefer exact match, then parent domain match
    const firstCandidate = candidates[0] ?? '';
    const exact = rows.find((r) => r.domain.toLowerCase() === firstCandidate);
    return exact ?? rows[0] ?? null;
  }

  async listByUserId(userId: string): Promise<UserWebSessionRow[]> {
    return this.db
      .select()
      .from(userWebSessions)
      .where(eq(userWebSessions.userId, userId))
      .orderBy(desc(userWebSessions.updatedAt));
  }

  async findById(id: string): Promise<UserWebSessionRow | null> {
    const [row] = await this.db
      .select()
      .from(userWebSessions)
      .where(eq(userWebSessions.id, id))
      .limit(1);

    return row ?? null;
  }

  async upsert(userId: string, input: UpsertSessionInput): Promise<UserWebSessionRow> {
    const candidates = extractDomainCandidates(input.domain);
    const normalizedDomain = candidates[0] ?? input.domain.trim().toLowerCase();
    const cookieCount = input.storageState.cookies?.length ?? 0;

    const existing = await this.findByUserAndDomain(userId, normalizedDomain);

    if (existing && existing.domain.toLowerCase() === normalizedDomain) {
      const [updated] = await this.db
        .update(userWebSessions)
        .set({
          name: input.name || existing.name,
          storageState: input.storageState,
          cookieCount,
          updatedAt: new Date(),
        })
        .where(eq(userWebSessions.id, existing.id))
        .returning();

      return updated!;
    }

    const [inserted] = await this.db
      .insert(userWebSessions)
      .values({
        userId,
        domain: normalizedDomain,
        name: input.name || normalizedDomain,
        storageState: input.storageState,
        cookieCount,
      })
      .returning();

    return inserted!;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(userWebSessions)
      .where(and(eq(userWebSessions.id, id), eq(userWebSessions.userId, userId)))
      .returning();

    return deleted.length > 0;
  }
}
