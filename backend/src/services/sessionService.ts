import { ValidationError } from '../errors/domainErrors.js';
import type {
  PlaywrightStorageCookie,
  PlaywrightStorageOrigin,
  PlaywrightStorageState,
} from '../db/schema.js';
import { SessionMapper, type SessionDto } from '../mappers/sessionMapper.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type { UserWebSessionEntity } from '../types/domain.js';
import { normalizeDomain } from '../utils/urlNormalizer.js';

export type { SessionDto };

export interface SyncSessionInput {
  domain: string;
  name?: string;
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
  }>;
  origins?: PlaywrightStorageOrigin[];
}

export class SessionService {
  constructor(private readonly sessionRepository: ISessionRepository) {}

  private normalizeSameSite(val?: string): 'Strict' | 'Lax' | 'None' {
    if (!val) return 'Lax';
    const lower = val.toLowerCase();
    if (lower === 'strict') return 'Strict';
    if (lower === 'no_restriction' || lower === 'none') return 'None';
    return 'Lax';
  }

  public toDto(entity: UserWebSessionEntity): SessionDto {
    return SessionMapper.entityToDto(entity);
  }

  async listSessions(userId: string): Promise<SessionDto[]> {
    const entities = await this.sessionRepository.listByUserId(userId);
    return entities.map((e) => SessionMapper.entityToDto(e));
  }

  async checkSession(userId: string, hostOrUrl: string): Promise<SessionDto | null> {
    const domain = normalizeDomain(hostOrUrl);
    const entity = await this.sessionRepository.findByUserAndDomain(userId, domain);
    return entity ? SessionMapper.entityToDto(entity) : null;
  }

  async getSessionStorageState(
    userId: string,
    hostOrUrl: string
  ): Promise<PlaywrightStorageState | null> {
    const domain = normalizeDomain(hostOrUrl);
    const entity = await this.sessionRepository.findByUserAndDomain(userId, domain);
    return entity ? entity.storageState : null;
  }

  async syncSession(userId: string, input: SyncSessionInput): Promise<SessionDto> {
    const domain = normalizeDomain(input.domain);

    if (!Array.isArray(input.cookies) || input.cookies.length === 0) {
      throw new ValidationError('At least one cookie is required to sync a session.', [
        { field: 'cookies', message: 'Cookies array cannot be empty.' },
      ]);
    }

    const sanitizedCookies: PlaywrightStorageCookie[] = input.cookies.map((c) => ({
      name: String(c.name || '').trim(),
      value: String(c.value || ''),
      domain: String(c.domain || domain).trim(),
      path: String(c.path || '/'),
      expires: typeof c.expires === 'number' && c.expires > 0 ? c.expires : -1,
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: this.normalizeSameSite(c.sameSite),
    }));

    const storageState: PlaywrightStorageState = {
      cookies: sanitizedCookies,
      origins: Array.isArray(input.origins) ? input.origins : [],
    };

    const entity = await this.sessionRepository.upsert(userId, {
      domain,
      name: input.name?.trim() || domain,
      storageState,
    });

    return SessionMapper.entityToDto(entity);
  }

  async deleteSession(userId: string, id: string): Promise<boolean> {
    return this.sessionRepository.delete(userId, id);
  }
}
