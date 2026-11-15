import { describe, expect, it } from 'vitest';
import {
  encryptText,
  decryptText,
  encryptJson,
  decryptJson,
  resolveEncryptionKey,
} from '../../src/utils/crypto.js';
import { DecryptionError } from '../../src/errors/domainErrors.js';
const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);
describe('Current encryption format', () => {
  it('accepts only 32-byte buffers or 64-character hexadecimal keys', () => {
    expect(resolveEncryptionKey(KEY)).toEqual(Buffer.from(KEY, 'hex'));
    expect(resolveEncryptionKey(Buffer.alloc(32))).toHaveLength(32);
    for (const key of ['password', '', 'g'.repeat(64), Buffer.alloc(8)])
      expect(() => resolveEncryptionKey(key)).toThrow(DecryptionError);
  });
  it('encrypts text, including empty strings, using distinct nonces', () => {
    for (const value of ['private-token', '']) {
      const encrypted = encryptText(value, KEY);
      expect(encrypted).toMatch(/^enc:v1:/);
      expect(decryptText(encrypted, KEY)).toBe(value);
      expect(encryptText(value, KEY)).not.toBe(encrypted);
    }
  });
  it('distinguishes absent optional credentials from invalid plaintext or ciphertext', () => {
    expect(decryptText(null, KEY)).toBeNull();
    expect(decryptText(undefined, KEY)).toBeNull();
    for (const value of ['', 'plaintext', 'enc:v2:unknown', 'enc:v1:broken'])
      expect(() => decryptText(value, KEY)).toThrow(DecryptionError);
    expect(() => decryptText(encryptText('secret', KEY), OTHER_KEY)).toThrow(DecryptionError);
  });
  it('round-trips authenticated JSON without exposing its contents', () => {
    const state = { cookies: [{ name: 'auth', value: 'private-cookie' }], origins: [] };
    const encrypted = encryptJson(state, KEY);
    expect(JSON.stringify(encrypted)).not.toContain('private-cookie');
    expect(decryptJson(encrypted, KEY)).toEqual(state);
    expect(() => decryptJson(encrypted, OTHER_KEY)).toThrow(DecryptionError);
    expect(() => decryptJson({ ...encrypted, tag: '00'.repeat(16) }, KEY)).toThrow(DecryptionError);
  });
  it('rejects plaintext JSON and malformed envelopes', () => {
    for (const value of [
      null,
      'plaintext',
      { cookies: [], origins: [] },
      { encrypted: true },
      { encrypted: true, v: 2, iv: '', tag: '', data: '' },
    ])
      expect(() => decryptJson(value, KEY)).toThrow(DecryptionError);
  });
});
