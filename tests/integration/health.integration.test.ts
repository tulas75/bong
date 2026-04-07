import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

const mockQueryRaw = vi.fn();

vi.mock('../../src/lib/prisma', () => ({
  prisma: {},
  prismaUnfiltered: { $queryRawUnsafe: (...args: any[]) => mockQueryRaw(...args) },
}));

import app from '../../src/app';

describe('GET /health', () => {
  it('returns 200 with db connected when DB is reachable', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  it('returns 503 when DB is unreachable', async () => {
    mockQueryRaw.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'unreachable' });
  });
});

describe('GET /', () => {
  it('returns 200 with landing page HTML', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('BONG');
  });
});
