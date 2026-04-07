/**
 * @module auth
 * Express middleware that authenticates requests via the
 * `X-API-Key` header. On success the decrypted tenant data is attached to
 * `req.tenant` for downstream handlers.
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import {
  extractApiKeyPrefix,
  verifyApiKey,
  decryptField,
  getEncryptionKey,
} from '../lib/crypto.js';
import { audit } from '../lib/logger.js';

/**
 * Extended Express request with an authenticated tenant attached.
 * Populated by {@link requireApiKey} after successful API-key verification.
 */
export interface AuthenticatedRequest extends Request {
  tenant?: {
    id: string;
    name: string;
    url: string;
    imageUrl?: string | null;
    publicKeyMultibase: string;
    privateKeyMultibase: string;
    p256PublicKeyMultibase?: string | null;
    p256PrivateKeyMultibase?: string | null;
    webhookSecret?: string | null;
  };
}

/**
 * Express middleware that validates the `X-API-Key` header, looks up the
 * tenant by key prefix, verifies the Argon2id hash, and attaches the
 * decrypted tenant record to `req.tenant`.
 *
 * Responds with `401` if the key is missing or invalid.
 */
export async function requireApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  const prefix = extractApiKeyPrefix(apiKey);
  const tenant = await prisma.tenant.findUnique({
    where: { apiKeyPrefix: prefix },
  });

  if (!tenant || !(await verifyApiKey(apiKey, tenant.apiKey))) {
    audit.warn({ ip: req.ip, path: req.path }, 'auth_failed: invalid API key');
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  const encryptionKey = getEncryptionKey();

  req.tenant = {
    id: tenant.id,
    name: tenant.name,
    url: tenant.url,
    imageUrl: tenant.imageUrl,
    publicKeyMultibase: tenant.publicKeyMultibase,
    privateKeyMultibase: decryptField(tenant.privateKeyMultibase, encryptionKey),
    p256PublicKeyMultibase: tenant.p256PublicKeyMultibase || null,
    p256PrivateKeyMultibase: tenant.p256PrivateKeyMultibase
      ? decryptField(tenant.p256PrivateKeyMultibase, encryptionKey)
      : null,
    webhookSecret: tenant.webhookSecret ? decryptField(tenant.webhookSecret, encryptionKey) : null,
  };

  next();
}
