import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createHmac } from 'crypto';
import { mockPrisma } from '../helpers/mockPrisma';
import { setupAuthenticatedTenant, TEST_API_KEY } from '../helpers/authHelper';
import { makeBadgeClass, makeAssertion } from '../helpers/fixtures';
import { encryptField } from '../../src/lib/crypto';

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

const WEBHOOK_SECRET = 'test-webhook-secret';

const validPayload = {
  resource: 'enrollment',
  action: 'completed',
  payload: {
    user: {
      email: 'user@example.com',
      first_name: 'John',
      last_name: 'Doe',
    },
    course: {
      id: 12345,
      name: 'Test Course',
    },
  },
};

function signPayload(body: object, secret: string): string {
  return createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
}

describe('POST /api/v1/webhooks/course-completed', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 201 without HMAC when tenant has no webhook secret', async () => {
    await setupAuthenticatedTenant({ webhookSecret: null });
    mockPrisma.badgeClass.findFirst.mockResolvedValue(makeBadgeClass());
    mockPrisma.assertion.create.mockResolvedValue(makeAssertion());

    const res = await request(app)
      .post('/api/v1/webhooks/course-completed')
      .set('X-API-Key', TEST_API_KEY)
      .send(validPayload);

    expect(res.status).toBe(201);
  });

  it('returns 201 with correct HMAC signature', async () => {
    const encKey = process.env.ENCRYPTION_KEY!;
    await setupAuthenticatedTenant({
      webhookSecret: encryptField(WEBHOOK_SECRET, encKey),
    });
    mockPrisma.badgeClass.findFirst.mockResolvedValue(makeBadgeClass());
    mockPrisma.assertion.create.mockResolvedValue(makeAssertion());

    const signature = signPayload(validPayload, WEBHOOK_SECRET);

    const res = await request(app)
      .post('/api/v1/webhooks/course-completed')
      .set('X-API-Key', TEST_API_KEY)
      .set('X-Webhook-Signature', signature)
      .send(validPayload);

    expect(res.status).toBe(201);
  });

  it('returns 401 when HMAC required but signature missing', async () => {
    const encKey = process.env.ENCRYPTION_KEY!;
    await setupAuthenticatedTenant({
      webhookSecret: encryptField(WEBHOOK_SECRET, encKey),
    });

    const res = await request(app)
      .post('/api/v1/webhooks/course-completed')
      .set('X-API-Key', TEST_API_KEY)
      .send(validPayload);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing X-Webhook-Signature header');
  });

  it('returns 401 when HMAC signature is wrong', async () => {
    const encKey = process.env.ENCRYPTION_KEY!;
    await setupAuthenticatedTenant({
      webhookSecret: encryptField(WEBHOOK_SECRET, encKey),
    });

    const res = await request(app)
      .post('/api/v1/webhooks/course-completed')
      .set('X-API-Key', TEST_API_KEY)
      .set('X-Webhook-Signature', 'deadbeef'.repeat(8))
      .send(validPayload);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid webhook signature');
  });

  it('returns 400 on invalid webhook body', async () => {
    await setupAuthenticatedTenant();

    const res = await request(app)
      .post('/api/v1/webhooks/course-completed')
      .set('X-API-Key', TEST_API_KEY)
      .send({ resource: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 404 when no badge matches course ID', async () => {
    await setupAuthenticatedTenant();
    mockPrisma.badgeClass.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/webhooks/course-completed')
      .set('X-API-Key', TEST_API_KEY)
      .send(validPayload);

    expect(res.status).toBe(404);
  });

  it('returns 409 on duplicate webhook delivery', async () => {
    await setupAuthenticatedTenant();
    mockPrisma.badgeClass.findFirst.mockResolvedValue(makeBadgeClass());
    mockPrisma.assertion.create.mockRejectedValue({ code: 'P2002' });

    const res = await request(app)
      .post('/api/v1/webhooks/course-completed')
      .set('X-API-Key', TEST_API_KEY)
      .send(validPayload);

    expect(res.status).toBe(409);
  });
});
