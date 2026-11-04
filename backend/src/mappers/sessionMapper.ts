import { decryptJson } from '../utils/crypto.js';
import type { PlaywrightStorageState } from '../types/session.js';
import type { SessionDto } from '@specter/contracts';
import type { UserWebSessionRow } from '../db/schema.js';
import type { UserWebSessionEntity } from '../types/domain.js';

export const SessionMapper = {
  rowToEntity(row: UserWebSessionRow): UserWebSessionEntity {
    return {
      id: row.id,
      userId: row.userId,
      domain: row.domain,
      name: row.name,
      storageState: decryptJson<PlaywrightStorageState>(row.storageState),
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
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  },
};
