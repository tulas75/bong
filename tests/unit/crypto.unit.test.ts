import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getEncryptionKey,
  encryptField,
  decryptField,
  extractApiKeyPrefix,
  hashApiKey,
  verifyApiKey,
  hashEmail,
  escapeHtml,
  API_KEY_PREFIX_LENGTH,
} from '../../src/lib/crypto';

describe('getEncryptionKey', () => {
  const original = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    process.env.ENCRYPTION_KEY = original;
  });

  it('returns key when valid 64-char hex', () => {
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
    expect(getEncryptionKey()).toBe('ab'.repeat(32));
  });

  it('throws when key is missing', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => getEncryptionKey()).toThrow('ENCRYPTION_KEY must be');
  });

  it('throws when key is too short', () => {
    process.env.ENCRYPTION_KEY = 'abcd';
    expect(() => getEncryptionKey()).toThrow('ENCRYPTION_KEY must be');
  });

  it('throws when key contains non-hex characters', () => {
    process.env.ENCRYPTION_KEY = 'g'.repeat(64);
    expect(() => getEncryptionKey()).toThrow('ENCRYPTION_KEY must be');
  });

  it('accepts uppercase hex', () => {
    process.env.ENCRYPTION_KEY = 'AB'.repeat(32);
    expect(getEncryptionKey()).toBe('AB'.repeat(32));
  });
});

describe('encryptField / decryptField', () => {
  const key = 'a'.repeat(64);

  it('round-trips plaintext', () => {
    const plaintext = 'hello world';
    const encrypted = encryptField(plaintext, key);
    expect(decryptField(encrypted, key)).toBe(plaintext);
  });

  it('produces iv:authTag:ciphertext format', () => {
    const encrypted = encryptField('test', key);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
  });

  it('generates different ciphertexts for same plaintext (random IV)', () => {
    const a = encryptField('same', key);
    const b = encryptField('same', key);
    expect(a).not.toBe(b);
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encryptField('test', key);
    const parts = encrypted.split(':');
    parts[2] = 'ff' + parts[2].slice(2); // tamper ciphertext
    expect(() => decryptField(parts.join(':'), key)).toThrow();
  });

  it('throws on tampered auth tag', () => {
    const encrypted = encryptField('test', key);
    const parts = encrypted.split(':');
    parts[1] = 'ff' + parts[1].slice(2); // tamper auth tag
    expect(() => decryptField(parts.join(':'), key)).toThrow();
  });

  it('throws on wrong key', () => {
    const encrypted = encryptField('test', key);
    const wrongKey = 'b'.repeat(64);
    expect(() => decryptField(encrypted, wrongKey)).toThrow();
  });

  it('throws on malformed input (no colons)', () => {
    expect(() => decryptField('nocolons', key)).toThrow('Invalid encrypted field format');
  });

  it('handles unicode plaintext', () => {
    const plaintext = 'héllo wörld 日本語';
    const encrypted = encryptField(plaintext, key);
    expect(decryptField(encrypted, key)).toBe(plaintext);
  });
});

describe('extractApiKeyPrefix', () => {
  it('extracts first 8 chars after bong_ prefix', () => {
    expect(extractApiKeyPrefix('bong_abcdef1234567890')).toBe('abcdef12');
  });

  it('extracts first 8 chars without prefix', () => {
    expect(extractApiKeyPrefix('abcdef1234567890')).toBe('abcdef12');
  });

  it('returns correct length', () => {
    expect(extractApiKeyPrefix('bong_abcdef1234567890')).toHaveLength(API_KEY_PREFIX_LENGTH);
  });
});

describe('hashApiKey / verifyApiKey', () => {
  it('verifies correct key', async () => {
    const hash = await hashApiKey('bong_testkey123');
    expect(await verifyApiKey('bong_testkey123', hash)).toBe(true);
  });

  it('rejects wrong key', async () => {
    const hash = await hashApiKey('bong_testkey123');
    expect(await verifyApiKey('bong_wrongkey456', hash)).toBe(false);
  });

  it('returns PHC format string', async () => {
    const hash = await hashApiKey('bong_testkey123');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('produces different hashes for same input (random salt)', async () => {
    const a = await hashApiKey('same');
    const b = await hashApiKey('same');
    expect(a).not.toBe(b);
  });
});

describe('hashEmail', () => {
  it('returns sha256$ prefixed hash', () => {
    const result = hashEmail('test@example.com');
    expect(result).toMatch(/^sha256\$[0-9a-f]{64}$/);
  });

  it('normalizes to lowercase', () => {
    expect(hashEmail('Test@Example.COM')).toBe(hashEmail('test@example.com'));
  });

  it('trims whitespace', () => {
    expect(hashEmail('  test@example.com  ')).toBe(hashEmail('test@example.com'));
  });

  it('produces different hashes for different emails', () => {
    expect(hashEmail('a@b.com')).not.toBe(hashEmail('c@d.com'));
  });
});

describe('escapeHtml', () => {
  it('escapes all dangerous characters', () => {
    expect(escapeHtml('<script>"a" & \'b\'')).toBe('&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;');
  });

  it('returns safe strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});
