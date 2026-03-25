import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockPrisma } from '../helpers/mockPrisma';
import { setupAuthenticatedTenant, TEST_API_KEY } from '../helpers/authHelper';
import { makeBadgeClass, makeAssertion } from '../helpers/fixtures';

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
    mockPrisma.assertion.create.mockResolvedValue(makeAssertion());

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
    mockPrisma.assertion.create.mockRejectedValue({ code: 'P2002' });

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
});
