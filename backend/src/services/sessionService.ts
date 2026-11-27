import type { PaginatedResponse, SessionDto } from '@specter/contracts';
import { EmptySessionCookiesError, SessionNotFoundError } from '../errors/domainErrors.js';
import { SessionMapper } from '../mappers/sessionMapper.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import type {
  PlaywrightStorageCookie,
  PlaywrightStorageOrigin,
  PlaywrightStorageState,
} from '../types/session.js';
import { resolvePageResult } from '../utils/pagination.js';
import { normalizeDomain } from '../utils/urlNormalizer.js';

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

  async listSessionsPage(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedResponse<SessionDto>> {
    const result = await resolvePageResult(
      page,
      pageSize,
      await this.sessionRepository.listPageByUserId(userId, page, pageSize),
      (safePage) => this.sessionRepository.listPageByUserId(userId, safePage, pageSize)
    );
    return {
      items: result.items.map(SessionMapper.entityToDto),
      pagination: result.pagination,
    };
  }

  async checkSession(userId: string, hostOrUrl: string): Promise<SessionDto | null> {
    const domain = normalizeDomain(hostOrUrl);
    const entity = await this.sessionRepository.findByUserAndDomain(userId, domain);
    return entity ? SessionMapper.entityToDto(entity) : null;
  }

  async syncSession(userId: string, input: SyncSessionInput): Promise<SessionDto> {
    const domain = normalizeDomain(input.domain);

    if (input.cookies.length === 0) {
      throw new EmptySessionCookiesError();
    }

    const sanitizedCookies: PlaywrightStorageCookie[] = input.cookies.map((cookie) => ({
      name: cookie.name.trim(),
      value: cookie.value,
      domain: (cookie.domain || domain).trim(),
      path: cookie.path || '/',
      expires: typeof cookie.expires === 'number' && cookie.expires > 0 ? cookie.expires : -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: this.normalizeSameSite(cookie.sameSite),
    }));

    const storageState: PlaywrightStorageState = {
      cookies: sanitizedCookies,
      origins: input.origins ?? [],
    };

    const entity = await this.sessionRepository.upsert(userId, {
      domain,
      name: input.name?.trim() || domain,
      storageState,
    });

    return SessionMapper.entityToDto(entity);
  }

  async deleteSession(userId: string, id: string): Promise<void> {
    const deleted = await this.sessionRepository.delete(userId, id);
    if (!deleted) {
      throw new SessionNotFoundError();
    }
  }
}
