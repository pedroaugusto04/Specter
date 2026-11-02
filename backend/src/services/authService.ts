import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { UnauthorizedError, ValidationError } from '../errors/domainErrors.js';
import { UserMapper, type UserDto } from '../mappers/userMapper.js';
import type { IUserRepository } from '../repositories/userRepository.js';
import {
  ACCESS_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  serializeCookie,
} from '../utils/cookies.js';
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

  constructor(userRepository: IUserRepository, options: AuthServiceOptions = {}) {
    this.userRepository = userRepository;
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

  public buildAuthCookies(tokens: AuthTokenPair): string[] {
    return [
      serializeCookie(ACCESS_COOKIE_NAME, tokens.accessToken, {
        httpOnly: true,
        secure: this.cookieSecure,
        sameSite: 'Lax',
        path: '/',
        maxAge: this.accessExpiresSeconds,
      }),
      serializeCookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
        httpOnly: true,
        secure: this.cookieSecure,
        sameSite: 'Lax',
        path: '/',
        maxAge: this.refreshExpiresSeconds,
      }),
    ];
  }

  public buildClearAuthCookies(): string[] {
    return [
      serializeCookie(ACCESS_COOKIE_NAME, '', {
        httpOnly: true,
        secure: this.cookieSecure,
        sameSite: 'Lax',
        path: '/',
        maxAge: 0,
      }),
      serializeCookie(REFRESH_COOKIE_NAME, '', {
        httpOnly: true,
        secure: this.cookieSecure,
        sameSite: 'Lax',
        path: '/',
        maxAge: 0,
      }),
      serializeCookie(OAUTH_STATE_COOKIE_NAME, '', {
        httpOnly: true,
        secure: this.cookieSecure,
        sameSite: 'Lax',
        path: '/',
        maxAge: 0,
      }),
    ];
  }

  public buildOAuthStateCookie(stateToken: string): string {
    return serializeCookie(OAUTH_STATE_COOKIE_NAME, stateToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'Lax',
      path: '/',
      maxAge: 600,
    });
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
  }): Promise<{ user: UserDto; tokens: AuthTokenPair }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.userRepository.findByEmail(normalizedEmail);

    if (existing) {
      throw new ValidationError('An account with this email already exists.', [
        { field: 'email', message: 'An account with this email already exists.' },
      ]);
    }

    const passwordHash = await hashPassword(input.password);
    const created = await this.userRepository.createUser({
      email: normalizedEmail,
      name: input.name?.trim() || null,
      passwordHash,
    });

    const userDto = UserMapper.entityToDto(created);
    const tokens = this.issueTokens(created);
    return { user: userDto, tokens };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: UserDto; tokens: AuthTokenPair }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.userRepository.findByEmail(normalizedEmail);

    if (!existing || !existing.passwordHash) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isValid = await verifyPassword(input.password, existing.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const userDto = UserMapper.entityToDto(existing);
    const tokens = this.issueTokens(existing);
    return { user: userDto, tokens };
  }

  async refresh(refreshToken: string): Promise<{ user: UserDto; tokens: AuthTokenPair }> {
    const payload = verifyJwt(refreshToken, this.jwtSecret, 'refresh');
    if (!payload || !payload.sub) {
      throw new UnauthorizedError('Invalid or expired session.');
    }

    const existing = await this.userRepository.findById(payload.sub);
    if (!existing) {
      throw new UnauthorizedError('User account no longer exists.');
    }

    const userDto = UserMapper.entityToDto(existing);
    const tokens = this.issueTokens(existing);
    return { user: userDto, tokens };
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

  createGoogleAuthorizationUrl(resolvedCallbackUrl?: string): {
    authUrl: string;
    stateToken: string;
  } {
    if (!this.isGoogleConfigured()) {
      throw new ValidationError('Google Sign-In is not configured on this server.');
    }

    const callbackUrl = resolvedCallbackUrl || this.googleCallbackUrl;
    if (!callbackUrl) {
      throw new ValidationError('Google OAuth callback URL is not configured.');
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const stateToken = signJwt({ sub: nonce, type: 'oauth_state' }, this.jwtSecret, 600);

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
  }): Promise<{ user: UserDto; tokens: AuthTokenPair }> {
    if (!this.isGoogleConfigured()) {
      throw new ValidationError('Google Sign-In is not configured on this server.');
    }

    if (!params.state || !params.expectedStateCookie || params.state !== params.expectedStateCookie) {
      throw new UnauthorizedError('Invalid OAuth state parameter.');
    }

    const statePayload = verifyJwt(params.state, this.jwtSecret, 'oauth_state');
    if (!statePayload) {
      throw new UnauthorizedError('Expired or invalid OAuth state.');
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
      throw new UnauthorizedError('Failed to exchange Google OAuth authorization code.');
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedError('Google OAuth did not return an access token.');
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      throw new UnauthorizedError('Failed to fetch user profile from Google.');
    }

    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      name?: string;
    };

    if (!profile.sub || !profile.email) {
      throw new UnauthorizedError('Google account did not provide a valid email address.');
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

    const userDto = UserMapper.entityToDto(user);
    const tokens = this.issueTokens(user);
    return { user: userDto, tokens };
  }
}
