import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWebSessions } from '../src/db/schema.js';
import type { Database } from '../src/db/index.js';
import { DrizzleSessionRepository } from '../src/repositories/sessionRepository.js';
import { decryptJson } from '../src/utils/crypto.js';
import type { PlaywrightStorageState } from '../src/types/session.js';

describe('Legacy saved-session encryption migration', () => {
  let pg: PGlite;
  let db: ReturnType<typeof drizzle>;
  let repository: DrizzleSessionRepository;

  beforeAll(async () => {
    pg = new PGlite();
    db = drizzle(pg);
    await pg.exec(`
      CREATE TABLE user_web_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        domain text NOT NULL,
        name text NOT NULL,
        storage_state jsonb NOT NULL,
        cookie_count integer NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `);
    repository = new DrizzleSessionRepository(db as unknown as Database);
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('re-encrypts validated pre-encryption storage state when it is read', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    const updatedAt = new Date('2026-11-01T12:00:00.000Z');
    const legacyState: PlaywrightStorageState = { cookies: [], origins: [] };
    await pg.query(
      `INSERT INTO user_web_sessions
        (id, user_id, domain, name, storage_state, cookie_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        id,
        userId,
        'example.com',
        'Legacy session',
        JSON.stringify(legacyState),
        0,
        updatedAt,
        updatedAt,
      ]
    );

    const session = await repository.findByUserAndDomain(userId, 'https://example.com/path');
    const [stored] = await db
      .select()
      .from(userWebSessions);

    expect(session?.storageState).toEqual(legacyState);
    expect(stored?.storageState).toMatchObject({ encrypted: true, v: 1 });
    expect(decryptJson(stored?.storageState)).toEqual(legacyState);
    expect(stored?.updatedAt.toISOString()).toBe(updatedAt.toISOString());
  });
});
