import { describe, it, expect, beforeAll } from 'vitest';
import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import { issueCredential } from '../../src/services/credential';

describe('issueCredential', () => {
  let publicKeyMultibase: string;
  let privateKeyMultibase: string;

  beforeAll(async () => {
    const keyPair = await Ed25519Multikey.generate();
    const exported = await keyPair.export({ publicKey: true, secretKey: true });
    publicKeyMultibase = exported.publicKeyMultibase!;
    privateKeyMultibase = exported.secretKeyMultibase!;
  });

  function makeParams(overrides: Record<string, any> = {}) {
    return {
      assertionId: '72910be6-cbde-441c-b602-484884dbc28e',
      tenant: {
        id: '58fcdb5a-b604-44bf-8c46-3bd89bc940b0',
        name: 'Test Academy',
        url: 'https://test.example.com',
        publicKeyMultibase,
        privateKeyMultibase,
      },
      badgeClass: {
        id: '622cf501-bf52-47f5-a5a0-c7f168f3d6bc',
        name: 'Test Badge',
        description: 'A test badge',
        imageUrl: 'https://example.com/badge.png',
        criteria: 'Complete the test',
      },
      recipientEmail: 'user@example.com',
      recipientName: 'Test User',
      issuedOn: new Date('2026-01-15T00:00:00Z'),
      ...overrides,
    };
  }

  it('returns a signed credential with proof', async () => {
    const { credential: result } = await issueCredential(makeParams());
    expect((result as any).proof).toBeDefined();
    expect((result as any).proof.proofValue).toBeTruthy();
  });

  it('has correct @context', async () => {
    const { credential: result } = await issueCredential(makeParams());
    expect((result as any)['@context']).toContain('https://www.w3.org/ns/credentials/v2');
    expect((result as any)['@context']).toContain(
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    );
  });

  it('includes OpenBadgeCredential type', async () => {
    const { credential: result } = await issueCredential(makeParams());
    expect((result as any).type).toContain('VerifiableCredential');
    expect((result as any).type).toContain('OpenBadgeCredential');
  });

  it('has issuer matching tenant', async () => {
    const { credential: result } = await issueCredential(makeParams());
    expect((result as any).issuer.name).toBe('Test Academy');
    expect((result as any).issuer.url).toBe('https://test.example.com');
    expect((result as any).issuer.id).toBe(`did:key:${publicKeyMultibase}`);
  });

  it('includes issuer image when tenant has imageUrl', async () => {
    const { credential: result } = await issueCredential(
      makeParams({
        tenant: {
          id: '58fcdb5a-b604-44bf-8c46-3bd89bc940b0',
          name: 'Test Academy',
          url: 'https://test.example.com',
          imageUrl: 'https://example.com/logo.png',
          publicKeyMultibase,
          privateKeyMultibase,
        },
      }),
    );
    expect((result as any).issuer.image).toBeDefined();
    expect((result as any).issuer.image.id).toBe('https://example.com/logo.png');
    expect((result as any).issuer.image.type).toBe('Image');
  });

  it('omits issuer image when tenant has no imageUrl', async () => {
    const { credential: result } = await issueCredential(makeParams());
    expect((result as any).issuer.image).toBeUndefined();
  });

  it('has hashed email with salt in credentialSubject', async () => {
    const { credential: result, salt } = await issueCredential(makeParams());
    const identifier = (result as any).credentialSubject.identifier[0];
    expect(identifier.hashed).toBe(true);
    expect(identifier.identityHash).toMatch(/^sha256\$[0-9a-f]{64}$/);
    expect(identifier.identityType).toBe('emailAddress');
    expect(salt).toBeTruthy();
    expect(identifier.salt).toBe(salt);
  });

  it('generates consistent hash when given explicit salt', async () => {
    const explicitSalt = 'abc123';
    const { credential: r1 } = await issueCredential(makeParams({ recipientSalt: explicitSalt }));
    const { credential: r2 } = await issueCredential(makeParams({ recipientSalt: explicitSalt }));
    expect((r1 as any).credentialSubject.identifier[0].identityHash).toBe(
      (r2 as any).credentialSubject.identifier[0].identityHash,
    );
  });

  it('has achievement matching badge', async () => {
    const { credential: result } = await issueCredential(makeParams());
    const achievement = (result as any).credentialSubject.achievement;
    expect(achievement.name).toBe('Test Badge');
    expect(achievement.description).toBe('A test badge');
    expect(achievement.criteria.narrative).toBe('Complete the test');
  });

  it('has DataIntegrityProof proof type', async () => {
    const { credential: result } = await issueCredential(makeParams());
    expect((result as any).proof.type).toBe('DataIntegrityProof');
    expect((result as any).proof.cryptosuite).toBe('eddsa-rdfc-2022');
  });

  it('has correct verification URL in id', async () => {
    const { credential: result } = await issueCredential(makeParams());
    expect((result as any).id).toBe(
      'https://test.example.com/verify/72910be6-cbde-441c-b602-484884dbc28e',
    );
  });

  it('includes validUntil when expiresAt is provided', async () => {
    const expiresAt = new Date('2027-06-01T00:00:00Z');
    const { credential: result } = await issueCredential(makeParams({ expiresAt }));
    expect((result as any).validUntil).toBe('2027-06-01T00:00:00.000Z');
  });

  it('omits validUntil when expiresAt is not provided', async () => {
    const { credential: result } = await issueCredential(makeParams());
    expect((result as any).validUntil).toBeUndefined();
  });

  it('returns salt that is a 32-char hex string', async () => {
    const { salt } = await issueCredential(makeParams());
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });
});
