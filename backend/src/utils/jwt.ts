import crypto from 'node:crypto';

export type JwtTokenType = 'access' | 'refresh' | 'oauth_state';

export interface JwtPayload {
  sub: string;
  email?: string;
  name?: string | null;
  type: JwtTokenType;
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padLength = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds: number
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + expiresInSeconds,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadEncoded = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${headerEncoded}.${payloadEncoded}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

export function verifyJwt(
  token: string,
  secret: string,
  expectedType?: JwtTokenType
): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerEncoded, payloadEncoded, signatureProvided] = parts;
    if (!headerEncoded || !payloadEncoded || !signatureProvided) return null;

    const data = `${headerEncoded}.${payloadEncoded}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const sigBuf = Buffer.from(signatureProvided, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const parsedHeader = JSON.parse(base64UrlDecode(headerEncoded)) as { alg?: string };
    if (parsedHeader.alg !== 'HS256') return null;

    const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as JwtPayload;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
      return null;
    }

    if (expectedType && payload.type !== expectedType) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
