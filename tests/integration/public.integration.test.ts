import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockPrisma } from '../helpers/mockPrisma';
import { makeTenant, makeBadgeClass, makeAssertion } from '../helpers/fixtures';

const mockBakeCredentialImage = vi.fn();
const mockVerifyCredentialProof = vi.fn();

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
  prismaUnfiltered: mockPrisma,
}));

vi.mock('../../src/services/baking.js', () => ({
  bakeCredentialImage: (...args: any[]) => mockBakeCredentialImage(...args),
}));

vi.mock('../../src/services/verify.js', () => ({
  verifyCredentialProof: (...args: any[]) => mockVerifyCredentialProof(...args),
}));

import app from '../../src/app';

describe('GET /verify/:assertionId', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockVerifyCredentialProof.mockResolvedValue({ verified: true });
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
    expect(res.headers['content-security-policy']).toContain("script-src 'unsafe-inline'");
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

  it('shows Revoked status for revoked assertion', async () => {
    const revokedAssertion = {
      ...assertionWithRelations,
      revokedAt: new Date('2026-03-01'),
      revocationReason: 'Issued by mistake',
    };
    mockPrisma.assertion.findUnique.mockResolvedValue(revokedAssertion);

    const res = await request(app).get('/verify/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Revoked');
    expect(res.text).toContain('Issued by mistake');
    expect(res.text).not.toContain('Verified Credential');
  });

  it('shows Expired status for expired assertion', async () => {
    const expiredAssertion = {
      ...assertionWithRelations,
      expiresAt: new Date('2025-01-01'),
    };
    mockPrisma.assertion.findUnique.mockResolvedValue(expiredAssertion);

    const res = await request(app).get('/verify/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Expired');
    expect(res.text).not.toContain('Verified Credential');
  });

  it('shows expiration date when set and not expired', async () => {
    const futureExpiry = {
      ...assertionWithRelations,
      expiresAt: new Date('2030-12-31'),
    };
    mockPrisma.assertion.findUnique.mockResolvedValue(futureExpiry);

    const res = await request(app).get('/verify/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Verified Credential');
    expect(res.text).toContain('2030-12-31');
    expect(res.text).toContain('Expires');
  });

  it('embeds credential JSON for modal viewer', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(assertionWithRelations);

    const res = await request(app).get('/verify/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.status).toBe(200);
    expect(res.text).toContain('id="vc-json"');
    expect(res.text).toContain('modal-overlay');
    expect(res.text).toContain('Copy to Clipboard');
  });

  it('returns JSON-LD when Accept: application/ld+json', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(assertionWithRelations);

    const res = await request(app)
      .get('/verify/72910be6-cbde-441c-b602-484884dbc28e')
      .set('Accept', 'application/ld+json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/vc\+ld\+json/);
    expect(res.body).toEqual(assertionWithRelations.payloadJson);
  });

  it('returns HTML when Accept: application/ld+json is absent', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(assertionWithRelations);

    const res = await request(app)
      .get('/verify/72910be6-cbde-441c-b602-484884dbc28e')
      .set('Accept', 'text/html');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Test Badge');
  });

  it('returns JSON-LD when Accept includes both html and ld+json', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(assertionWithRelations);

    const res = await request(app)
      .get('/verify/72910be6-cbde-441c-b602-484884dbc28e')
      .set('Accept', 'text/html, application/ld+json; q=0.9');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/vc\+ld\+json/);
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

  it('uses baked image URL in verification page', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(assertionWithRelations);

    const res = await request(app).get('/verify/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.status).toBe(200);
    expect(res.text).toContain('/badges/72910be6-cbde-441c-b602-484884dbc28e/image');
    expect(res.text).not.toContain('https://example.com/badge.png');
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
    expect(res.headers['content-type']).toMatch(/application\/vc\+ld\+json/);
  });

  it('returns 404 for missing assertion', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/assertions/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Assertion not found');
  });

  it('returns original credential without mutation when revoked', async () => {
    const revoked = makeAssertion({
      revokedAt: new Date('2026-03-01T00:00:00Z'),
      revocationReason: 'Fraudulent',
      payloadJson: {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiableCredential', 'OpenBadgeCredential'],
        credentialStatus: {
          type: 'BitstringStatusListEntry',
          statusListIndex: '3',
          statusPurpose: 'revocation',
        },
        proof: { type: 'DataIntegrityProof', cryptosuite: 'eddsa-rdfc-2022', proofValue: 'mock' },
      },
    });
    mockPrisma.assertion.findUnique.mockResolvedValue(revoked);

    const res = await request(app).get('/api/v1/assertions/72910be6-cbde-441c-b602-484884dbc28e');

    expect(res.status).toBe(200);
    expect(res.body.credentialStatus.type).toBe('BitstringStatusListEntry');
    expect(res.body.credentialStatus.type).not.toBe('RevocationStatus');
    expect(res.body.credentialStatus.revoked).toBeUndefined();
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
    expect(res.body.type).toBe('Multikey');
    expect(res.body.publicKeyMultibase).toBe(tenant.publicKeyMultibase);
    expect(res.body['@context']).toContain('multikey');
  });

  it('returns 404 for missing tenant', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/keys/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Tenant not found');
  });
});

describe('GET /badges/:assertionId/image', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockBakeCredentialImage.mockReset();
  });

  const MINIMAL_PNG = Buffer.from(
    '89504e470d0a1a0a0000000d49484452' +
      '00000001000000010802000090770d' +
      'de0000000c4944415408d763f8cfc0' +
      '00000003000100518d0e4e00000000' +
      '49454e44ae426082',
    'hex',
  );

  const assertionWithBadgeClass = {
    ...makeAssertion(),
    badgeClass: makeBadgeClass(),
  };

  it('returns baked PNG image for valid assertion', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(assertionWithBadgeClass);
    mockBakeCredentialImage.mockResolvedValue({
      buffer: MINIMAL_PNG,
      extension: 'png',
    });

    const res = await request(app).get('/badges/72910be6-cbde-441c-b602-484884dbc28e/image');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['content-disposition']).toContain(
      'badge-72910be6-cbde-441c-b602-484884dbc28e.png',
    );
    expect(mockBakeCredentialImage).toHaveBeenCalledWith(
      'https://example.com/badge.png',
      JSON.stringify(assertionWithBadgeClass.payloadJson),
    );
  });

  it('returns baked SVG image when badge is SVG', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(assertionWithBadgeClass);
    mockBakeCredentialImage.mockResolvedValue({
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      extension: 'svg',
    });

    const res = await request(app).get('/badges/72910be6-cbde-441c-b602-484884dbc28e/image');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(res.headers['content-disposition']).toContain('.svg');
  });

  it('redirects to original image when baking fails', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(assertionWithBadgeClass);
    mockBakeCredentialImage.mockResolvedValue(null);

    const res = await request(app).get('/badges/72910be6-cbde-441c-b602-484884dbc28e/image');

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('https://example.com/badge.png');
  });

  it('returns 404 for missing assertion', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/badges/00000000-0000-0000-0000-000000000000/image');

    expect(res.status).toBe(404);
  });
});
