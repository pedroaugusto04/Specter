import crypto from 'node:crypto';
import type { UserDto } from '@specter/contracts';
import { env } from '../config/env.js';
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidSessionError,
  OAuthExchangeError,
  OAuthNotConfiguredError,
  OAuthStateError,
  UserNotFoundError,
} from '../errors/domainErrors.js';
import { UserMapper } from '../mappers/userMapper.js';
import type { IUserRepository, UpdateUserPatch } from '../repositories/userRepository.js';
import {
  ACCESS_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  serializeCookie,
} from '../utils/cookies.js';
import { resolveTimezone } from '../utils/dateFormatter.js';
import { signJwt, verifyJwt, type JwtPayload } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthServiceOptions {
  jwtSecret?: string;
  accessExpiresSeconds?: number;
  refreshExpiresSeconds?: number;
  cookieSecure?: boolean;
  googleClientId?: string;
  googleClientSecret?: string;
  googleCallbackUrl?: string;
  frontendUrl?: string;
  onTimezoneChanged?: (userId: string) => Promise<void>;
}

export class AuthService {
  private readonly userRepository: IUserRepository;
  private readonly jwtSecret: string;
  private readonly accessExpiresSeconds: number;
  private readonly refreshExpiresSeconds: number;
  private readonly cookieSecure: boolean;
  private readonly googleClientId: string;
  private readonly googleClientSecret: string;
  private readonly googleCallbackUrl: string;
  public readonly frontendUrl: string;
  private readonly onTimezoneChanged?: (userId: string) => Promise<void>;

  constructor(userRepository: IUserRepository, options: AuthServiceOptions = {}) {
    this.userRepository = userRepository;
    this.onTimezoneChanged = options.onTimezoneChanged;
    this.jwtSecret = options.jwtSecret ?? env.JWT_SECRET;
    this.accessExpiresSeconds = options.accessExpiresSeconds ?? env.JWT_ACCESS_EXPIRES_SECONDS;
    this.refreshExpiresSeconds = options.refreshExpiresSeconds ?? env.JWT_REFRESH_EXPIRES_SECONDS;
    this.cookieSecure =
      options.cookieSecure ??
      (env.COOKIE_SECURE !== undefined
        ? env.COOKIE_SECURE === 'true'
        : env.NODE_ENV === 'production');
    this.googleClientId = options.googleClientId ?? env.GOOGLE_CLIENT_ID;
    this.googleClientSecret = options.googleClientSecret ?? env.GOOGLE_CLIENT_SECRET;
    this.googleCallbackUrl = options.googleCallbackUrl ?? env.GOOGLE_CALLBACK_URL;
    this.frontendUrl = options.frontendUrl ?? env.FRONTEND_URL;
  }

  public isGoogleConfigured(): boolean {
    return Boolean(this.googleClientId && this.googleClientSecret);
  }

  private buildCookie(name: string, value: string, maxAge: number): string {
    return serializeCookie(name, value, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'Lax',
      path: '/',
      maxAge,
    });
  }

  public buildAuthCookies(tokens: AuthTokenPair): string[] {
    return [
      this.buildCookie(ACCESS_COOKIE_NAME, tokens.accessToken, this.accessExpiresSeconds),
      this.buildCookie(REFRESH_COOKIE_NAME, tokens.refreshToken, this.refreshExpiresSeconds),
    ];
  }

  public buildClearAuthCookies(): string[] {
    return [
      this.buildCookie(ACCESS_COOKIE_NAME, '', 0),
      this.buildCookie(REFRESH_COOKIE_NAME, '', 0),
      this.buildClearOAuthStateCookie(),
    ];
  }

  public buildOAuthStateCookie(stateToken: string): string {
    return this.buildCookie(OAUTH_STATE_COOKIE_NAME, stateToken, 600);
  }

  public buildClearOAuthStateCookie(): string {
    return this.buildCookie(OAUTH_STATE_COOKIE_NAME, '', 0);
  }

  private issueTokens(user: { id: string; email: string; name: string | null }): AuthTokenPair {
    const accessToken = signJwt(
      { sub: user.id, email: user.email, name: user.name, type: 'access' },
      this.jwtSecret,
      this.accessExpiresSeconds
    );
    const refreshToken = signJwt(
      { sub: user.id, email: user.email, name: user.name, type: 'refresh' },
      this.jwtSecret,
      this.refreshExpiresSeconds
    );
    return { accessToken, refreshToken };
  }

  async register(input: {
    email: string;
    password: string;
    name?: string;
    timezone?: string;
  }): Promise<{ user: UserDto; tokens: AuthTokenPair }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.userRepository.findByEmail(normalizedEmail);

    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await hashPassword(input.password);
    const created = await this.userRepository.createUser({
      email: normalizedEmail,
      name: input.name?.trim() || null,
      passwordHash,
      ...(input.timezone ? { timezone: resolveTimezone(input.timezone) } : {}),
    });

    return {
      user: UserMapper.entityToDto(created),
      tokens: this.issueTokens(created),
    };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: UserDto; tokens: AuthTokenPair }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.userRepository.findByEmail(normalizedEmail);

    if (!existing?.passwordHash) {
      throw new InvalidCredentialsError();
    }

    const isValid = await verifyPassword(input.password, existing.passwordHash);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    return {
      user: UserMapper.entityToDto(existing),
      tokens: this.issueTokens(existing),
    };
  }

  async refresh(refreshToken: string): Promise<{ user: UserDto; tokens: AuthTokenPair }> {
    const payload = verifyJwt(refreshToken, this.jwtSecret, 'refresh');
    if (!payload?.sub) {
      throw new InvalidSessionError('expired');
    }

    const existing = await this.userRepository.findById(payload.sub);
    if (!existing) {
      throw new InvalidSessionError('user_missing');
    }

    return {
      user: UserMapper.entityToDto(existing),
      tokens: this.issueTokens(existing),
    };
  }

  async updateProfile(
    userId: string,
    input: Pick<UpdateUserPatch, 'name' | 'timezone' | 'pageLanguage' | 'browserPageLanguage'>
  ): Promise<UserDto> {
    const patch: UpdateUserPatch = {
      ...(input.pageLanguage !== undefined ? { pageLanguage: input.pageLanguage } : {}),
      ...(input.browserPageLanguage !== undefined
        ? { browserPageLanguage: input.browserPageLanguage }
        : {}),
      ...(input.name !== undefined ? { name: input.name?.trim() || null } : {}),
      ...(input.timezone !== undefined ? { timezone: resolveTimezone(input.timezone) } : {}),
    };

    const updated = await this.userRepository.updateUser(userId, patch);
    if (!updated) {
      throw new UserNotFoundError(userId);
    }

    if (input.timezone !== undefined) {
      await this.onTimezoneChanged?.(userId);
    }

    return UserMapper.entityToDto(updated);
  }

  verifyAccessToken(accessToken: string): JwtPayload | null {
    return verifyJwt(accessToken, this.jwtSecret, 'access');
  }

  async resolveSession(
    accessToken?: string,
    refreshToken?: string
  ): Promise<{ user: UserDto; refreshedTokens?: AuthTokenPair } | null> {
    if (accessToken) {
      const payload = this.verifyAccessToken(accessToken);
      if (payload?.sub) {
        const entity = await this.userRepository.findById(payload.sub);
        if (entity) {
          return { user: UserMapper.entityToDto(entity) };
        }
      }
    }

    if (refreshToken) {
      try {
        const refreshed = await this.refresh(refreshToken);
        return { user: refreshed.user, refreshedTokens: refreshed.tokens };
      } catch {
        return null;
      }
    }

    return null;
  }

  createGoogleAuthorizationUrl(
    resolvedCallbackUrl?: string,
    extraStateData?: { source?: 'web' | 'extension' }
  ): {
    authUrl: string;
    stateToken: string;
  } {
    if (!this.isGoogleConfigured()) {
      throw new OAuthNotConfiguredError();
    }

    const callbackUrl = resolvedCallbackUrl || this.googleCallbackUrl;
    if (!callbackUrl) {
      throw new OAuthNotConfiguredError(true);
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const stateToken = signJwt(
      { sub: nonce, type: 'oauth_state', ...extraStateData },
      this.jwtSecret,
      600
    );

    const params = new URLSearchParams({
      client_id: this.googleClientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state: stateToken,
      prompt: 'select_account',
    });

    return {
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      stateToken,
    };
  }

  async authenticateGoogleCallback(params: {
    code: string;
    state: string;
    expectedStateCookie?: string;
    resolvedCallbackUrl?: string;
  }): Promise<{ user: UserDto; tokens: AuthTokenPair; statePayload: JwtPayload }> {
    if (!this.isGoogleConfigured()) {
      throw new OAuthNotConfiguredError();
    }

    if (
      !params.state ||
      !params.expectedStateCookie ||
      params.state !== params.expectedStateCookie
    ) {
      throw new OAuthStateError('invalid');
    }

    const statePayload = verifyJwt(params.state, this.jwtSecret, 'oauth_state');
    if (!statePayload) {
      throw new OAuthStateError('expired');
    }

    const callbackUrl = params.resolvedCallbackUrl || this.googleCallbackUrl;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: params.code,
        client_id: this.googleClientId,
        client_secret: this.googleClientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      throw new OAuthExchangeError('token');
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new OAuthExchangeError('access_token');
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      throw new OAuthExchangeError('profile');
    }

    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };

    if (!profile.sub || !profile.email || profile.email_verified !== true) {
      throw new OAuthExchangeError('email');
    }

    const normalizedEmail = profile.email.trim().toLowerCase();
    let user = await this.userRepository.findByGoogleId(profile.sub);

    if (!user) {
      const existingByEmail = await this.userRepository.findByEmail(normalizedEmail);
      if (existingByEmail) {
        user =
          (await this.userRepository.updateUser(existingByEmail.id, {
            googleId: profile.sub,
            name: existingByEmail.name ?? profile.name ?? null,
          })) ?? existingByEmail;
      } else {
        user = await this.userRepository.createUser({
          email: normalizedEmail,
          name: profile.name ?? null,
          googleId: profile.sub,
        });
      }
    }

    return {
      user: UserMapper.entityToDto(user),
      tokens: this.issueTokens(user),
      statePayload,
    };
  }
}
