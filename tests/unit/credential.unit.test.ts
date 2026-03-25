import { describe, it, expect, beforeAll } from 'vitest';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { issueCredential } from '../../src/services/credential';

describe('issueCredential', () => {
  let publicKeyMultibase: string;
  let privateKeyMultibase: string;

  beforeAll(async () => {
    const keyPair = await Ed25519VerificationKey2020.generate();
    const exported = keyPair.export({ publicKey: true, privateKey: true });
    publicKeyMultibase = exported.publicKeyMultibase!;
    privateKeyMultibase = exported.privateKeyMultibase!;
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
    const result = (await issueCredential(makeParams())) as any;
    expect(result.proof).toBeDefined();
    expect(result.proof.proofValue).toBeTruthy();
  });

  it('has correct @context', async () => {
    const result = (await issueCredential(makeParams())) as any;
    expect(result['@context']).toContain('https://www.w3.org/2018/credentials/v1');
    expect(result['@context']).toContain('https://purl.imsglobal.org/spec/ob/v3p0/context.json');
  });

  it('includes OpenBadgeCredential type', async () => {
    const result = (await issueCredential(makeParams())) as any;
    expect(result.type).toContain('VerifiableCredential');
    expect(result.type).toContain('OpenBadgeCredential');
  });

  it('has issuer matching tenant', async () => {
    const result = (await issueCredential(makeParams())) as any;
    expect(result.issuer.name).toBe('Test Academy');
    expect(result.issuer.id).toBe('https://test.example.com');
  });

  it('has hashed email in credentialSubject', async () => {
    const result = (await issueCredential(makeParams())) as any;
    const identifier = result.credentialSubject.identifier;
    expect(identifier.hashed).toBe(true);
    expect(identifier.identityHash).toMatch(/^sha256\$/);
    expect(identifier.identityType).toBe('emailAddress');
  });

  it('has achievement matching badge', async () => {
    const result = (await issueCredential(makeParams())) as any;
    const achievement = result.credentialSubject.achievement;
    expect(achievement.name).toBe('Test Badge');
    expect(achievement.description).toBe('A test badge');
    expect(achievement.criteria.narrative).toBe('Complete the test');
  });

  it('has Ed25519Signature2020 proof type', async () => {
    const result = (await issueCredential(makeParams())) as any;
    expect(result.proof.type).toBe('Ed25519Signature2020');
  });

  it('has correct verification URL in id', async () => {
    const result = (await issueCredential(makeParams())) as any;
    expect(result.id).toBe('https://test.example.com/verify/72910be6-cbde-441c-b602-484884dbc28e');
  });
});
