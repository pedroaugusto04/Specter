import { ValidationError } from '../errors/domainErrors.js';
import type {
  PlaywrightStorageCookie,
  PlaywrightStorageOrigin,
  PlaywrightStorageState,
  UserWebSessionRow,
} from '../db/schema.js';
import type { ISessionRepository } from '../repositories/sessionRepository.js';

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

export interface SessionDto {
  id: string;
  domain: string;
  name: string;
  cookieCount: number;
  createdAt: string;
  updatedAt: string;
}

export class SessionService {
  constructor(private readonly sessionRepository: ISessionRepository) {}

  private normalizeDomain(input: string): string {
    const trimmed = input.trim().toLowerCase();
    const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
    const firstPart = withoutProtocol.split('/')[0] ?? '';
    const hostOnly = firstPart.split(':')[0] ?? '';
    if (!hostOnly || hostOnly.includes(' ')) {
      throw new ValidationError('Invalid domain format.', [
        { field: 'domain', message: 'Domain must be a valid host or URL.' },
      ]);
    }
    return hostOnly;
  }

  private normalizeSameSite(val?: string): 'Strict' | 'Lax' | 'None' {
    if (!val) return 'Lax';
    const lower = val.toLowerCase();
    if (lower === 'strict') return 'Strict';
    if (lower === 'no_restriction' || lower === 'none') return 'None';
    return 'Lax';
  }

  public toDto(row: UserWebSessionRow): SessionDto {
    return {
      id: row.id,
      domain: row.domain,
      name: row.name,
      cookieCount: row.cookieCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listSessions(userId: string): Promise<SessionDto[]> {
    const rows = await this.sessionRepository.listByUserId(userId);
    return rows.map((r) => this.toDto(r));
  }

  async checkSession(userId: string, hostOrUrl: string): Promise<SessionDto | null> {
    const domain = this.normalizeDomain(hostOrUrl);
    const row = await this.sessionRepository.findByUserAndDomain(userId, domain);
    return row ? this.toDto(row) : null;
  }

  async getSessionStorageState(userId: string, hostOrUrl: string): Promise<PlaywrightStorageState | null> {
    const domain = this.normalizeDomain(hostOrUrl);
    const row = await this.sessionRepository.findByUserAndDomain(userId, domain);
    return row ? row.storageState : null;
  }

  async syncSession(userId: string, input: SyncSessionInput): Promise<SessionDto> {
    const domain = this.normalizeDomain(input.domain);

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

    const row = await this.sessionRepository.upsert(userId, {
      domain,
      name: input.name?.trim() || domain,
      storageState,
    });

    return this.toDto(row);
  }

  async deleteSession(userId: string, id: string): Promise<boolean> {
    return this.sessionRepository.delete(userId, id);
  }
}
