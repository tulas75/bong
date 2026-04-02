import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockPrisma } from '../helpers/mockPrisma';
import { setupAuthenticatedTenant, TEST_API_KEY } from '../helpers/authHelper';
import { makeTenant, makeBadgeClass, makeAssertion } from '../helpers/fixtures';
import { issueBadge } from '../../src/services/issuance';

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
  prismaUnfiltered: mockPrisma,
}));

vi.mock('../../src/services/issuance', () => ({
  issueBadge: vi.fn().mockResolvedValue({
    assertion: makeAssertion(),
    verifyUrl: 'https://localhost:3000/verify/72910be6-cbde-441c-b602-484884dbc28e',
  }),
}));

import app from '../../src/app';

describe('POST /api/v1/assertions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validBody = {
    badgeClassId: '622cf501-bf52-47f5-a5a0-c7f168f3d6bc',
    recipientEmail: 'user@example.com',
    recipientName: 'Test User',
  };

  it('returns 201 on valid assertion', async () => {
    await setupAuthenticatedTenant();
    mockPrisma.badgeClass.findFirst.mockResolvedValue(makeBadgeClass());

    const res = await request(app)
      .post('/api/v1/assertions')
      .set('X-API-Key', TEST_API_KEY)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.recipientName).toBe('Test User');
  });

  it('returns 400 on invalid badgeClassId', async () => {
    await setupAuthenticatedTenant();

    const res = await request(app)
      .post('/api/v1/assertions')
      .set('X-API-Key', TEST_API_KEY)
      .send({ ...validBody, badgeClassId: 'not-a-uuid' });

    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid email', async () => {
    await setupAuthenticatedTenant();

    const res = await request(app)
      .post('/api/v1/assertions')
      .set('X-API-Key', TEST_API_KEY)
      .send({ ...validBody, recipientEmail: 'bad' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when badgeClass not found', async () => {
    await setupAuthenticatedTenant();
    mockPrisma.badgeClass.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/assertions')
      .set('X-API-Key', TEST_API_KEY)
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('BadgeClass not found');
  });

  it('returns 409 on duplicate assertion', async () => {
    await setupAuthenticatedTenant();
    mockPrisma.badgeClass.findFirst.mockResolvedValue(makeBadgeClass());
    (issueBadge as any).mockRejectedValueOnce({ code: 'P2002' });

    const res = await request(app)
      .post('/api/v1/assertions')
      .set('X-API-Key', TEST_API_KEY)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Badge already issued to this recipient');
  });

  it('returns 400 on empty body', async () => {
    await setupAuthenticatedTenant();

    const res = await request(app)
      .post('/api/v1/assertions')
      .set('X-API-Key', TEST_API_KEY)
      .send({});

    expect(res.status).toBe(400);
  });

  it('accepts optional expiresAt', async () => {
    await setupAuthenticatedTenant();
    mockPrisma.badgeClass.findFirst.mockResolvedValue(makeBadgeClass());

    const res = await request(app)
      .post('/api/v1/assertions')
      .set('X-API-Key', TEST_API_KEY)
      .send({ ...validBody, expiresAt: '2027-01-01T00:00:00Z' });

    expect(res.status).toBe(201);
  });
});

describe('POST /api/v1/assertions/:id/revoke', () => {
  const assertionId = '72910be6-cbde-441c-b602-484884dbc28e';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 on successful revocation', async () => {
    const tenant = await setupAuthenticatedTenant();
    const assertion = makeAssertion({ badgeClass: makeBadgeClass({ tenantId: tenant.id }) });
    mockPrisma.assertion.findUnique.mockResolvedValue(assertion);
    mockPrisma.assertion.update.mockResolvedValue({
      ...assertion,
      revokedAt: new Date(),
      revocationReason: 'Issued by mistake',
    });

    const res = await request(app)
      .post(`/api/v1/assertions/${assertionId}/revoke`)
      .set('X-API-Key', TEST_API_KEY)
      .send({ reason: 'Issued by mistake' });

    expect(res.status).toBe(200);
    expect(res.body.revocationReason).toBe('Issued by mistake');
  });

  it('returns 400 when reason is missing', async () => {
    await setupAuthenticatedTenant();

    const res = await request(app)
      .post(`/api/v1/assertions/${assertionId}/revoke`)
      .set('X-API-Key', TEST_API_KEY)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 404 when assertion not found', async () => {
    await setupAuthenticatedTenant();
    mockPrisma.assertion.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/assertions/${assertionId}/revoke`)
      .set('X-API-Key', TEST_API_KEY)
      .send({ reason: 'test' });

    expect(res.status).toBe(404);
  });

  it('returns 403 when assertion belongs to different tenant', async () => {
    await setupAuthenticatedTenant();
    const assertion = makeAssertion({
      badgeClass: makeBadgeClass({ tenantId: 'different-tenant-id' }),
    });
    mockPrisma.assertion.findUnique.mockResolvedValue(assertion);

    const res = await request(app)
      .post(`/api/v1/assertions/${assertionId}/revoke`)
      .set('X-API-Key', TEST_API_KEY)
      .send({ reason: 'test' });

    expect(res.status).toBe(403);
  });

  it('returns 409 when already revoked', async () => {
    const tenant = await setupAuthenticatedTenant();
    const assertion = makeAssertion({
      revokedAt: new Date(),
      revocationReason: 'Already revoked',
      badgeClass: makeBadgeClass({ tenantId: tenant.id }),
    });
    mockPrisma.assertion.findUnique.mockResolvedValue(assertion);

    const res = await request(app)
      .post(`/api/v1/assertions/${assertionId}/revoke`)
      .set('X-API-Key', TEST_API_KEY)
      .send({ reason: 'test' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Assertion already revoked');
  });
});
