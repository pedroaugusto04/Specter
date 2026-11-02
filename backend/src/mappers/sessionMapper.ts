import type { UserWebSessionRow } from '../db/schema.js';
import type { UserWebSessionEntity } from '../types/domain.js';

export interface SessionDto {
  id: string;
  domain: string;
  name: string;
  cookieCount: number;
  createdAt: string;
  updatedAt: string;
}

export const SessionMapper = {
  rowToEntity(row: UserWebSessionRow): UserWebSessionEntity {
    return {
      id: row.id,
      userId: row.userId,
      domain: row.domain,
      name: row.name,
      storageState: row.storageState,
      cookieCount: row.cookieCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  entityToDto(entity: UserWebSessionEntity): SessionDto {
    return {
      id: entity.id,
      domain: entity.domain,
      name: entity.name,
      cookieCount: entity.cookieCount,
      createdAt:
        entity.createdAt instanceof Date
          ? entity.createdAt.toISOString()
          : String(entity.createdAt),
      updatedAt:
        entity.updatedAt instanceof Date
          ? entity.updatedAt.toISOString()
          : String(entity.updatedAt),
    };
  },

  rowToDto(row: UserWebSessionRow): SessionDto {
    return SessionMapper.entityToDto(SessionMapper.rowToEntity(row));
  },
};
