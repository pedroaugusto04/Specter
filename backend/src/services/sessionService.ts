import { ValidationError } from '../errors/domainErrors.js';
import type {
  PlaywrightStorageCookie,
  PlaywrightStorageOrigin,
  PlaywrightStorageState,
} from '../types/session.js';
import { SessionMapper } from '../mappers/sessionMapper.js';
import type { SessionDto } from '@specter/contracts';
import type { ISessionRepository } from '../repositories/sessionRepository.js';
import { normalizeDomain } from '../utils/urlNormalizer.js';
import type { PaginatedResponse } from '@specter/contracts';
import { resolvePageResult } from '../utils/pagination.js';

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
      items: result.items.map((entity) => SessionMapper.entityToDto(entity)),
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

    if (!input.cookies?.length) {
      throw new ValidationError('At least one cookie is required to sync a session.', [
        { field: 'cookies', message: 'Cookies array cannot be empty.' },
      ]);
    }

    const sanitizedCookies: PlaywrightStorageCookie[] = input.cookies.map((c) => ({
      name: (c.name || '').trim(),
      value: c.value || '',
      domain: (c.domain || domain).trim(),
      path: c.path || '/',
      expires: typeof c.expires === 'number' && c.expires > 0 ? c.expires : -1,
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: this.normalizeSameSite(c.sameSite),
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

  async deleteSession(userId: string, id: string): Promise<boolean> {
    return this.sessionRepository.delete(userId, id);
  }
}
