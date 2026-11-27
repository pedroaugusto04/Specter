import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { users } from '../db/schema.js';
import { PersistenceError } from '../errors/domainErrors.js';
import { UserMapper } from '../mappers/userMapper.js';
import type { UserEntity } from '../types/domain.js';

export interface CreateUserInput {
  email: string;
  name?: string | null;
  passwordHash?: string | null;
  googleId?: string | null;
  timezone?: string;
}

export interface UpdateUserPatch {
  pageLanguage?: string | null;
  browserPageLanguage?: string | null;
  name?: string | null;
  passwordHash?: string | null;
  googleId?: string | null;
  timezone?: string;
}

export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByGoogleId(googleId: string): Promise<UserEntity | null>;
  createUser(input: CreateUserInput): Promise<UserEntity>;
  updateUser(id: string, patch: UpdateUserPatch): Promise<UserEntity | null>;
}

export class DrizzleUserRepository implements IUserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<UserEntity | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? UserMapper.rowToEntity(row) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    const [row] = await this.db.select().from(users).where(eq(users.email, normalized)).limit(1);
    return row ? UserMapper.rowToEntity(row) : null;
  }

  async findByGoogleId(googleId: string): Promise<UserEntity | null> {
    const [row] = await this.db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    return row ? UserMapper.rowToEntity(row) : null;
  }

  async createUser(input: CreateUserInput): Promise<UserEntity> {
    const [row] = await this.db
      .insert(users)
      .values({
        email: input.email.trim().toLowerCase(),
        name: input.name ?? null,
        passwordHash: input.passwordHash ?? null,
        googleId: input.googleId ?? null,
        ...(input.timezone ? { timezone: input.timezone } : {}),
      })
      .returning();

    if (!row) {
      throw new PersistenceError('create user record');
    }

    return UserMapper.rowToEntity(row);
  }

  async updateUser(id: string, patch: UpdateUserPatch): Promise<UserEntity | null> {
    const [row] = await this.db
      .update(users)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return row ? UserMapper.rowToEntity(row) : null;
  }
}
