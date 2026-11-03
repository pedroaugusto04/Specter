import type { UserRow } from '../db/schema.js';
import type { UserEntity } from '../types/domain.js';

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  createdAt: string;
}

export const UserMapper = {
  rowToEntity(row: UserRow): UserEntity {
    return {
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      passwordHash: row.passwordHash ?? null,
      googleId: row.googleId ?? null,
      timezone: row.timezone ?? 'America/Sao_Paulo',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  entityToDto(entity: UserEntity): UserDto {
    return {
      id: entity.id,
      email: entity.email,
      name: entity.name,
      timezone: entity.timezone || 'America/Sao_Paulo',
      createdAt: entity.createdAt.toISOString(),
    };
  },

  rowToDto(row: UserRow): UserDto {
    return UserMapper.entityToDto(UserMapper.rowToEntity(row));
  },
};
