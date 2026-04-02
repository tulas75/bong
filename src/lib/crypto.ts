import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

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
 */
export function extractApiKeyPrefix(rawKey: string): string {
  const body = rawKey.startsWith('bong_') ? rawKey.slice(5) : rawKey;
  return body.slice(0, API_KEY_PREFIX_LENGTH);
}

/** Hash an API key with Argon2id. Returns the PHC-format hash string. */
export async function hashApiKey(rawKey: string): Promise<string> {
  return argon2.hash(rawKey, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 1,
  });
}

/** Verify a raw API key against an Argon2id hash. */
export async function verifyApiKey(rawKey: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, rawKey);
}

/** @deprecated Use hashApiKey (argon2id) for new keys. Retained only for migration verification. */
export function hashApiKeySha256(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

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

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
