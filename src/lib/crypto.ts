/**
 * @module crypto
 * Cryptographic utilities for field-level encryption (AES-256-GCM),
 * API-key hashing (Argon2id), and email identity hashing. All encrypted values
 * are stored as `iv:authTag:ciphertext` hex strings.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Read and validate the `ENCRYPTION_KEY` environment variable.
 * @returns A 64-character hex string (256-bit key).
 * @throws If the key is missing or malformed.
 */
export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (256 bits). ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return key;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param plaintext - The value to encrypt.
 * @param masterKeyHex - 64-char hex encryption key.
 * @returns `iv:authTag:ciphertext` hex string.
 */
export function encryptField(plaintext: string, masterKeyHex: string): string {
  const key = Buffer.from(masterKeyHex, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a value encrypted by {@link encryptField}.
 * @param encrypted - `iv:authTag:ciphertext` hex string.
 * @param masterKeyHex - 64-char hex encryption key.
 * @returns The original plaintext.
 * @throws If the format is invalid or decryption fails (tampered data).
 */
export function decryptField(encrypted: string, masterKeyHex: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted field format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const key = Buffer.from(masterKeyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Length of the prefix stored for DB lookups (before the underscore-separated body). */
export const API_KEY_PREFIX_LENGTH = 8;

/**
 * Extract the lookup prefix from a raw API key.
 * Keys have the format `bong_<hex>`, so we take the first 8 chars of the hex portion.
 * @param rawKey - Full API key string (e.g. `bong_abc123...`).
 * @returns An 8-character prefix used for database lookups.
 */
export function extractApiKeyPrefix(rawKey: string): string {
  const body = rawKey.startsWith('bong_') ? rawKey.slice(5) : rawKey;
  return body.slice(0, API_KEY_PREFIX_LENGTH);
}

/** Hash an API key with Argon2id (64 MiB, 3 iterations). Returns a PHC-format string. */
export async function hashApiKey(rawKey: string): Promise<string> {
  return argon2.hash(rawKey, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 1,
  });
}

/** Verify a raw API key against an Argon2id PHC hash. */
export async function verifyApiKey(rawKey: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, rawKey);
}

/**
 * @deprecated Use {@link hashApiKey} (Argon2id) for new keys.
 * Retained only for migration verification of legacy SHA-256 hashes.
 */
export function hashApiKeySha256(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Hash an email address with a random or explicit salt for pseudonymous identity.
 * @param email - Recipient email address.
 * @param explicitSalt - Optional existing salt (for re-derivation).
 * @returns Object with `identityHash` (`sha256$<hex>`) and the `salt` used.
 */
export function hashEmail(
  email: string,
  explicitSalt?: string,
): { identityHash: string; salt: string } {
  const normalized = email.toLowerCase().trim();
  const salt = explicitSalt || randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(salt + normalized)
    .digest('hex');
  return { identityHash: `sha256$${hash}`, salt };
}

/**
 * Escape HTML-special characters to prevent XSS in rendered templates.
 * @param str - Raw string.
 * @returns HTML-safe string with `&`, `<`, `>`, `"`, `'` escaped.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
