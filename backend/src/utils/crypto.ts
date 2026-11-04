import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { DecryptionError } from '../errors/domainErrors.js';

const CryptoFormat = {
  algorithm: 'aes-256-gcm',
  prefix: 'enc:v1:',
  version: 1,
} as const;
const KeyBytes = 32;
const IvBytes = 12;
const TagBytes = 16;
const HEX = /^[0-9a-f]+$/i;
export type { EncryptedJsonEnvelope } from '../types/crypto.js';
import type { EncryptedJsonEnvelope } from '../types/crypto.js';
export function resolveEncryptionKey(explicitKey?: string | Buffer): Buffer {
  const key = explicitKey ?? env.ENCRYPTION_KEY;
  if (Buffer.isBuffer(key)) {
    if (key.length === KeyBytes) return key;
  } else if (key.length === KeyBytes * 2 && HEX.test(key)) return Buffer.from(key, 'hex');
  throw new DecryptionError();
}
function decryptValue<T>(decrypt: (key: Buffer) => T, key?: string | Buffer): T {
  try {
    return decrypt(resolveEncryptionKey(key));
  } catch (error) {
    throw new DecryptionError(error);
  }
}
function decryptParts(iv: string, tag: string, data: string, key: Buffer): string {
  if (
    typeof iv !== 'string' ||
    typeof tag !== 'string' ||
    typeof data !== 'string' ||
    iv.length !== IvBytes * 2 ||
    tag.length !== TagBytes * 2 ||
    data.length % 2 ||
    !HEX.test(iv) ||
    !HEX.test(tag) ||
    (data.length > 0 && !HEX.test(data))
  )
    throw new DecryptionError();
  const decipher = crypto.createDecipheriv(CryptoFormat.algorithm, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
}
function encryptParts(plain: string, key?: Buffer | string) {
  const iv = crypto.randomBytes(IvBytes);
  const cipher = crypto.createCipheriv(CryptoFormat.algorithm, resolveEncryptionKey(key), iv);
  const data = cipher.update(plain, 'utf8', 'hex') + cipher.final('hex');
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data };
}
export function encryptText(plainText: string, key?: Buffer | string): string {
  const { iv, tag, data } = encryptParts(plainText, key);
  return `${CryptoFormat.prefix}${iv}:${tag}:${data}`;
}
export function decryptText(
  cipherText: string | null | undefined,
  key?: Buffer | string
): string | null {
  if (cipherText === null || cipherText === undefined) return null;
  if (!cipherText.startsWith(CryptoFormat.prefix)) throw new DecryptionError();
  const parts = cipherText.slice(CryptoFormat.prefix.length).split(':');
  if (parts.length !== 3) throw new DecryptionError();
  const [iv, tag, data] = parts as [string, string, string];
  return decryptValue((candidate) => decryptParts(iv, tag, data, candidate), key);
}
export function encryptJson<T>(data: T, key?: Buffer | string): EncryptedJsonEnvelope {
  return { encrypted: true, v: CryptoFormat.version, ...encryptParts(JSON.stringify(data), key) };
}
export function decryptJson<T>(envelopeOrData: unknown, key?: Buffer | string): T {
  if (!envelopeOrData || typeof envelopeOrData !== 'object') throw new DecryptionError();
  const envelope = envelopeOrData as Partial<EncryptedJsonEnvelope>;
  if (envelope.encrypted !== true) throw new DecryptionError();
  if (
    envelope.v !== CryptoFormat.version ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.tag !== 'string' ||
    typeof envelope.data !== 'string'
  )
    throw new DecryptionError();
  const { iv, tag, data } = envelope;
  return decryptValue((candidate) => JSON.parse(decryptParts(iv, tag, data, candidate)) as T, key);
}
