import type { UserDto } from '@specter/contracts';
import type { UserRow } from '../db/schema.js';
import type { UserEntity } from '../types/domain.js';

export const UserMapper = {
  rowToEntity(row: UserRow): UserEntity {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.passwordHash,
      googleId: row.googleId,
      pageLanguage: row.pageLanguage,
      browserPageLanguage: row.browserPageLanguage,
      timezone: row.timezone,
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
      timezone: entity.timezone,
      createdAt: entity.createdAt.toISOString(),
    };
  },
};
