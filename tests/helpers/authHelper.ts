import { hashApiKey, extractApiKeyPrefix, encryptField } from '../../src/lib/crypto';
import { mockPrisma } from './mockPrisma';
import { makeTenant } from './fixtures';

export const TEST_API_KEY = 'bong_aabbccdd11223344eeff5566';

let cachedHash: string | null = null;

export async function setupAuthenticatedTenant(overrides: Record<string, any> = {}) {
  if (!cachedHash) {
    cachedHash = await hashApiKey(TEST_API_KEY);
  }

  const encKey = process.env.ENCRYPTION_KEY!;
  const tenant = makeTenant({
    apiKeyPrefix: extractApiKeyPrefix(TEST_API_KEY),
    apiKey: cachedHash,
    privateKeyMultibase: encryptField('z-fake-private-key', encKey),
    ...overrides,
  });

  mockPrisma.tenant.findUnique.mockResolvedValue(tenant);
  return tenant;
}
