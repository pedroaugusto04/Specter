/**
 * Tests for the AES-256-GCM encryption utilities (crypto.ts).
 *
 * Covers:
 * - encryptText / decryptText round-trip
 * - decryptText backward-compatibility (plaintext passthrough)
 * - encryptJson / decryptJson round-trip with complex objects
 * - decryptJson backward-compatibility (non-envelope passthrough)
 * - Tampered auth tag causes decryptText to return null (integrity)
 * - Tampered data causes decryptJson to return original (integrity)
 * - resolveEncryptionKey: hex key, non-hex string derivation
 */

import { describe, it, expect } from 'vitest';
import {
  encryptText,
  decryptText,
  encryptJson,
  decryptJson,
  resolveEncryptionKey,
  type EncryptedJsonEnvelope,
} from '../src/utils/crypto.js';

// A known 32-byte hex key for deterministic tests
const TEST_KEY_HEX = 'a'.repeat(64); // 32 bytes of 0xaa
const TEST_KEY_BUF = Buffer.from(TEST_KEY_HEX, 'hex');

// ─────────────────────────────────────────────
// resolveEncryptionKey
// ─────────────────────────────────────────────
describe('resolveEncryptionKey', () => {
  it('returns a Buffer as-is when it is exactly 32 bytes', () => {
    const key = Buffer.alloc(32, 0xbb);
    expect(resolveEncryptionKey(key)).toBe(key);
  });

  it('parses a 64-char hex string into 32 bytes', () => {
    const result = resolveEncryptionKey(TEST_KEY_HEX);
    expect(result).toEqual(TEST_KEY_BUF);
    expect(result.length).toBe(32);
  });

  it('derives a 32-byte key via SHA-256 for non-hex strings', () => {
    const result = resolveEncryptionKey('some-arbitrary-jwt-secret');
    expect(result.length).toBe(32);
  });

  it('produces the same key for the same non-hex input (deterministic)', () => {
    const a = resolveEncryptionKey('deterministic-input');
    const b = resolveEncryptionKey('deterministic-input');
    expect(a).toEqual(b);
  });

  it('produces different keys for different inputs', () => {
    const a = resolveEncryptionKey('input-a');
    const b = resolveEncryptionKey('input-b');
    expect(a).not.toEqual(b);
  });
});

// ─────────────────────────────────────────────
// encryptText / decryptText
// ─────────────────────────────────────────────
describe('encryptText / decryptText', () => {
  it('round-trips a simple string', () => {
    const plain = 'hello-world-secret';
    const cipher = encryptText(plain, TEST_KEY_HEX);
    expect(cipher).toMatch(/^enc:v1:/);
    expect(decryptText(cipher, TEST_KEY_HEX)).toBe(plain);
  });

  it('round-trips a bot token with special characters', () => {
    const token = '1234567890:AAFxyz_AbCdEfGhIjKlMnOpQrStUvWxYz';
    const cipher = encryptText(token, TEST_KEY_HEX);
    expect(decryptText(cipher, TEST_KEY_HEX)).toBe(token);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const plain = 'same-input';
    const c1 = encryptText(plain, TEST_KEY_HEX);
    const c2 = encryptText(plain, TEST_KEY_HEX);
    expect(c1).not.toBe(c2);
  });

  it('returns empty string unchanged', () => {
    expect(encryptText('', TEST_KEY_HEX)).toBe('');
  });

  it('backward-compat: decryptText returns plaintext as-is when not prefixed', () => {
    const plain = 'legacy-unencrypted-value';
    expect(decryptText(plain, TEST_KEY_HEX)).toBe(plain);
  });

  it('decryptText returns null for null input', () => {
    expect(decryptText(null, TEST_KEY_HEX)).toBeNull();
  });

  it('decryptText returns null for undefined input', () => {
    expect(decryptText(undefined, TEST_KEY_HEX)).toBeNull();
  });

  it('tampered auth tag causes decryptText to return null (AEAD integrity)', () => {
    const plain = 'integrity-test';
    const cipher = encryptText(plain, TEST_KEY_HEX);

    // cipher = "enc:v1:<iv>:<tag>:<data>"
    const parts = cipher.split(':');
    // parts[0]='enc', [1]='v1', [2]=<iv>, [3]=<tag>, [4]=<data>
    parts[3] = 'deadbeefdeadbeefdeadbeefdeadbeef'; // replace tag with garbage
    const tampered = parts.join(':');

    expect(decryptText(tampered, TEST_KEY_HEX)).toBeNull();
  });

  it('decryptText with a different key returns null (wrong key = auth failure)', () => {
    const plain = 'wrong-key-test';
    const cipher = encryptText(plain, TEST_KEY_HEX);
    const wrongKey = 'b'.repeat(64);
    expect(decryptText(cipher, wrongKey)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// encryptJson / decryptJson
// ─────────────────────────────────────────────
describe('encryptJson / decryptJson', () => {
  const sampleState = {
    cookies: [
      {
        name: 'session',
        value: 'secret-cookie-value',
        domain: 'example.com',
        path: '/',
        expires: 9999999999,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [{ origin: 'https://example.com', localStorage: [] }],
  };

  it('round-trips a complex PlaywrightStorageState object', () => {
    const envelope = encryptJson(sampleState, TEST_KEY_HEX);
    expect(envelope.encrypted).toBe(true);
    expect(envelope.v).toBe(1);
    expect(typeof envelope.iv).toBe('string');
    expect(typeof envelope.tag).toBe('string');
    expect(typeof envelope.data).toBe('string');

    const decrypted = decryptJson<typeof sampleState>(envelope, TEST_KEY_HEX);
    expect(decrypted).toEqual(sampleState);
  });

  it('the encrypted envelope does NOT contain the raw cookie value', () => {
    const envelope = encryptJson(sampleState, TEST_KEY_HEX);
    expect(JSON.stringify(envelope)).not.toContain('secret-cookie-value');
  });

  it('produces different ciphertexts per call (random IV)', () => {
    const e1 = encryptJson(sampleState, TEST_KEY_HEX);
    const e2 = encryptJson(sampleState, TEST_KEY_HEX);
    expect(e1.iv).not.toBe(e2.iv);
    expect(e1.data).not.toBe(e2.data);
  });

  it('backward-compat: decryptJson returns a plain object as-is (no envelope fields)', () => {
    const plain = { cookies: [], origins: [] };
    const result = decryptJson<typeof plain>(plain, TEST_KEY_HEX);
    expect(result).toEqual(plain);
  });

  it('backward-compat: decryptJson returns primitives and null as-is', () => {
    expect(decryptJson(null, TEST_KEY_HEX)).toBeNull();
    expect(decryptJson('raw-string', TEST_KEY_HEX)).toBe('raw-string');
  });

  it('tampered auth tag causes decryptJson to return the original envelope (integrity fallback)', () => {
    const envelope: EncryptedJsonEnvelope = {
      ...encryptJson(sampleState, TEST_KEY_HEX),
      tag: 'deadbeefdeadbeefdeadbeefdeadbeef',
    };
    // Falls back to returning the envelope itself (not the plaintext)
    const result = decryptJson<typeof sampleState>(envelope, TEST_KEY_HEX);
    expect(result).toEqual(envelope);
    expect((result as unknown as EncryptedJsonEnvelope).encrypted).toBe(true);
  });

  it('decryptJson with a wrong key returns the original envelope (auth failure)', () => {
    const envelope = encryptJson(sampleState, TEST_KEY_HEX);
    const wrongKey = 'c'.repeat(64);
    const result = decryptJson<typeof sampleState>(envelope, wrongKey);
    // Should not expose plaintext
    expect(result).not.toEqual(sampleState);
  });
});

// ─────────────────────────────────────────────
// Integration: encrypt with one API, decrypt with the other should fail
// ─────────────────────────────────────────────
describe('cross-function isolation', () => {
  it('encryptText output is NOT valid input to decryptJson', () => {
    const cipher = encryptText('some-text', TEST_KEY_HEX);
    // decryptJson expects an object; a string is returned as-is
    const result = decryptJson<string>(cipher, TEST_KEY_HEX);
    expect(result).toBe(cipher);
  });
});
