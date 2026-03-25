import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockPrisma } from '../helpers/mockPrisma';
import { makeTenant, makeBadgeClass, makeAssertion } from '../helpers/fixtures';

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import app from '../../src/app';

describe('GET /verify/:assertionId', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const assertionWithRelations = {
    ...makeAssertion(),
    badgeClass: {
      ...makeBadgeClass(),
      tenant: makeTenant(),
    },
  };

  it('returns HTML for valid assertion', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(assertionWithRelations);

    const res = await request(app).get('/verify/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Test Badge');
    expect(res.text).toContain('Test User');
  });

  it('returns 404 for missing assertion', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/verify/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.text).toContain('Badge not found');
  });

  it('sets CSP header', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(assertionWithRelations);

    const res = await request(app).get('/verify/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('escapes HTML in template variables', async () => {
    const xssAssertion = {
      ...assertionWithRelations,
      badgeClass: {
        ...assertionWithRelations.badgeClass,
        name: '<script>alert("xss")</script>',
      },
    };
    mockPrisma.assertion.findUnique.mockResolvedValue(xssAssertion);

    const res = await request(app).get('/verify/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('uses custom template when present', async () => {
    const customAssertion = {
      ...assertionWithRelations,
      badgeClass: {
        ...assertionWithRelations.badgeClass,
        templateHtml: '<html><body>CUSTOM: {{badgeName}}</body></html>',
      },
    };
    mockPrisma.assertion.findUnique.mockResolvedValue(customAssertion);

    const res = await request(app).get('/verify/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.status).toBe(200);
    expect(res.text).toContain('CUSTOM: Test Badge');
  });
});

describe('GET /api/v1/assertions/:assertionId (public)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns JSON-LD for valid assertion', async () => {
    const assertion = makeAssertion();
    mockPrisma.assertion.findUnique.mockResolvedValue(assertion);

    const res = await request(app).get('/api/v1/assertions/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/ld\+json/);
  });

  it('returns 404 for missing assertion', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/assertions/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Assertion not found');
  });
});

describe('GET /keys/:tenantId', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns key document for valid tenant', async () => {
    const tenant = makeTenant();
    mockPrisma.tenant.findUnique.mockResolvedValue(tenant);

    const res = await request(app).get('/keys/58fcdb5a-b604-44bf-8c46-3bd89bc940b0');

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('Ed25519VerificationKey2020');
    expect(res.body.publicKeyMultibase).toBe(tenant.publicKeyMultibase);
    expect(res.body['@context']).toContain('ed25519-2020');
  });

  it('returns 404 for missing tenant', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/keys/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Tenant not found');
  });
});
