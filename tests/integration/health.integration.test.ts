import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {},
}));

import app from '../../src/app';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /', () => {
  it('returns 200 with landing page HTML', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('BONG');
  });
});
