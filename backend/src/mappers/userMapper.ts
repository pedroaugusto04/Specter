import type { UserDto } from '@specter/contracts';
import type { UserRow } from '../db/schema.js';
import type { UserEntity } from '../types/domain.js';

export const UserMapper = {
  rowToEntity(row: UserRow): UserEntity {
    return {
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      passwordHash: row.passwordHash ?? null,
      googleId: row.googleId ?? null,
      pageLanguage: row.pageLanguage,
      browserPageLanguage: row.browserPageLanguage,
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
      pageLanguage: entity.pageLanguage,
      browserPageLanguage: entity.browserPageLanguage,
      timezone: entity.timezone || 'America/Sao_Paulo',
      createdAt: entity.createdAt.toISOString(),
    };
  },
};
