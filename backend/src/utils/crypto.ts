import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits standard for GCM
const PREFIX_V1 = 'enc:v1:';

export interface EncryptedJsonEnvelope {
  encrypted: true;
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

/**
 * Resolves or derives a 32-byte (256-bit) encryption key buffer.
 */
export function resolveEncryptionKey(explicitKey?: string | Buffer): Buffer {
  if (Buffer.isBuffer(explicitKey) && explicitKey.length === 32) {
    return explicitKey;
  }

  const candidate = typeof explicitKey === 'string' && explicitKey.trim()
    ? explicitKey.trim()
    : env.ENCRYPTION_KEY || env.JWT_SECRET;

  // If candidate is a 64-character hex string representing 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(candidate)) {
    return Buffer.from(candidate, 'hex');
  }

  // Derive a deterministic 32-byte key via SHA-256
  return crypto.createHash('sha256').update(candidate).digest();
}

/**
 * Encrypts a plain text string using AES-256-GCM.
 * Output format: "enc:v1:<iv_hex>:<tag_hex>:<cipher_hex>"
 */
export function encryptText(plainText: string, key?: Buffer | string): string {
  if (!plainText) return plainText;

  const encKey = resolveEncryptionKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, encKey, iv);
  let ciphertext = cipher.update(plainText, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${PREFIX_V1}${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypts a text encrypted with AES-256-GCM.
 * Gracefully returns the text as-is if it was not encrypted (backward compatibility).
 */
export function decryptText(cipherText: string | null | undefined, key?: Buffer | string): string | null {
  if (!cipherText) return cipherText ?? null;
  if (!cipherText.startsWith(PREFIX_V1)) {
    return cipherText;
  }

  try {
    const encKey = resolveEncryptionKey(key);
    const parts = cipherText.slice(PREFIX_V1.length).split(':');
    if (parts.length !== 3) return cipherText;

    const [ivHex, tagHex, dataHex] = parts;
    if (!ivHex || !tagHex || !dataHex) return cipherText;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, encKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(dataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    // If decryption fails (e.g. key changed), return null or original
    return null;
  }
}

/**
 * Encrypts an arbitrary JSON-serializable object into an authenticated envelope.
 */
export function encryptJson<T>(data: T, key?: Buffer | string): EncryptedJsonEnvelope {
  const serialized = JSON.stringify(data);
  const encKey = resolveEncryptionKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, encKey, iv);
  let ciphertext = cipher.update(serialized, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted: true,
    v: 1,
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    data: ciphertext,
  };
}

/**
 * Decrypts an authenticated JSON envelope back into the original object.
 * Gracefully returns the object as-is if it was not encrypted (backward compatibility).
 */
export function decryptJson<T>(envelopeOrData: unknown, key?: Buffer | string): T {
  if (!envelopeOrData || typeof envelopeOrData !== 'object') {
    return envelopeOrData as T;
  }

  const envelope = envelopeOrData as Partial<EncryptedJsonEnvelope>;
  if (envelope.encrypted !== true || !envelope.iv || !envelope.tag || !envelope.data) {
    return envelopeOrData as T;
  }

  try {
    const encKey = resolveEncryptionKey(key);
    const iv = Buffer.from(envelope.iv, 'hex');
    const authTag = Buffer.from(envelope.tag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, encKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(envelope.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as T;
  } catch {
    return envelopeOrData as T;
  }
}
