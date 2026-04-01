import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockPrisma } from '../helpers/mockPrisma';
import { setupAuthenticatedTenant, TEST_API_KEY } from '../helpers/authHelper';
import { makeBadgeClass } from '../helpers/fixtures';

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
  prismaUnfiltered: mockPrisma,
}));

import app from '../../src/app';

describe('POST /api/v1/badges', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validBody = {
    name: 'Test Badge',
    description: 'A test badge',
    imageUrl: 'https://example.com/badge.png',
    criteria: 'Complete the test',
  };

  it('returns 201 on valid badge creation', async () => {
    await setupAuthenticatedTenant();
    const badge = makeBadgeClass();
    mockPrisma.badgeClass.create.mockResolvedValue(badge);

    const res = await request(app)
      .post('/api/v1/badges')
      .set('X-API-Key', TEST_API_KEY)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Badge');
  });

  it('returns 400 on missing name', async () => {
    await setupAuthenticatedTenant();

    const { name, ...body } = validBody;
    const res = await request(app).post('/api/v1/badges').set('X-API-Key', TEST_API_KEY).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 on invalid imageUrl', async () => {
    await setupAuthenticatedTenant();

    const res = await request(app)
      .post('/api/v1/badges')
      .set('X-API-Key', TEST_API_KEY)
      .send({ ...validBody, imageUrl: 'not-a-url' });

    expect(res.status).toBe(400);
  });

  it('returns 400 on empty body', async () => {
    await setupAuthenticatedTenant();

    const res = await request(app).post('/api/v1/badges').set('X-API-Key', TEST_API_KEY).send({});

    expect(res.status).toBe(400);
  });

  it('attaches tenant ID from auth', async () => {
    const tenant = await setupAuthenticatedTenant();
    mockPrisma.badgeClass.create.mockResolvedValue(makeBadgeClass());

    await request(app).post('/api/v1/badges').set('X-API-Key', TEST_API_KEY).send(validBody);

    expect(mockPrisma.badgeClass.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: tenant.id }),
      }),
    );
  });
});
