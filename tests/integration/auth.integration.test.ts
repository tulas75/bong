import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockPrisma } from '../helpers/mockPrisma';
import { setupAuthenticatedTenant, TEST_API_KEY } from '../helpers/authHelper';
import { makeTenant, makeBadgeClass } from '../helpers/fixtures';

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../src/services/credential', () => ({
  issueCredential: vi.fn().mockResolvedValue({
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential'],
    proof: { type: 'Ed25519Signature2020', proofValue: 'mock' },
  }),
}));

vi.mock('../../src/services/email', () => ({
  sendBadgeIssuedEmail: vi.fn().mockResolvedValue(undefined),
}));

import app from '../../src/app';

describe('requireApiKey middleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when X-API-Key header is missing', async () => {
    const res = await request(app).post('/api/v1/badges').send({ name: 'test' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing X-API-Key header');
  });

  it('returns 401 when API key prefix is not found', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/badges')
      .set('X-API-Key', 'bong_unknownkey12345')
      .send({ name: 'test' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid API key');
  });

  it('returns 401 when API key does not match', async () => {
    // Create a tenant with a hash for a different key
    const { hashApiKey, extractApiKeyPrefix, encryptField } = await import('../../src/lib/crypto');
    const differentKey = 'bong_aabbccddotherkeyvalue';
    const hash = await hashApiKey(differentKey);
    const encKey = process.env.ENCRYPTION_KEY!;
    const tenant = makeTenant({
      apiKeyPrefix: extractApiKeyPrefix(TEST_API_KEY), // same prefix so lookup succeeds
      apiKey: hash, // but hash is for a different key
      privateKeyMultibase: encryptField('z-fake', encKey),
    });
    mockPrisma.tenant.findUnique.mockResolvedValue(tenant);

    const res = await request(app)
      .post('/api/v1/badges')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'test' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid API key');
  });

  it('passes authentication with valid API key', async () => {
    await setupAuthenticatedTenant();
    const badge = makeBadgeClass();
    mockPrisma.badgeClass.create.mockResolvedValue(badge);

    const res = await request(app).post('/api/v1/badges').set('X-API-Key', TEST_API_KEY).send({
      name: 'Test Badge',
      description: 'A test',
      imageUrl: 'https://example.com/badge.png',
      criteria: 'Complete it',
    });

    expect(res.status).toBe(201);
  });
});
