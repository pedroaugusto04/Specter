import { decryptJson } from '../utils/crypto.js';
import { DecryptionError } from '../errors/domainErrors.js';
import type { PlaywrightStorageState } from '../types/session.js';
import type { SessionDto } from '@specter/contracts';
import type { UserWebSessionRow } from '../db/schema.js';
import type { UserWebSessionEntity } from '../types/domain.js';

function isStorageState(value: unknown): value is PlaywrightStorageState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PlaywrightStorageState>;
  return (
    Array.isArray(state.cookies) &&
    state.cookies.every(
      (cookie) =>
        cookie !== null &&
        typeof cookie === 'object' &&
        typeof cookie.name === 'string' &&
        typeof cookie.value === 'string' &&
        typeof cookie.domain === 'string' &&
        typeof cookie.path === 'string' &&
        typeof cookie.expires === 'number' &&
        typeof cookie.httpOnly === 'boolean' &&
        typeof cookie.secure === 'boolean' &&
        ['Strict', 'Lax', 'None'].includes(cookie.sameSite)
    ) &&
    Array.isArray(state.origins) &&
    state.origins.every(
      (origin) =>
        origin !== null &&
        typeof origin === 'object' &&
        typeof origin.origin === 'string' &&
        Array.isArray(origin.localStorage) &&
        origin.localStorage.every(
          (entry) =>
            entry !== null &&
            typeof entry === 'object' &&
            typeof entry.name === 'string' &&
            typeof entry.value === 'string'
        )
    )
  );
}

export const SessionMapper = {
  isLegacyPlaintextStorageState(value: unknown): value is PlaywrightStorageState {
    return isStorageState(value);
  },

  rowToEntity(row: UserWebSessionRow): UserWebSessionEntity {
    const storageState = isStorageState(row.storageState)
      ? row.storageState
      : decryptJson<PlaywrightStorageState>(row.storageState);
    if (!isStorageState(storageState)) throw new DecryptionError();
    return {
      id: row.id,
      userId: row.userId,
      domain: row.domain,
      name: row.name,
      storageState,
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
