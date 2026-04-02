import { describe, it, expect, beforeAll } from 'vitest';
import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import { signStatusListCredential } from '../../src/services/statusList';

describe('signStatusListCredential', () => {
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
      tenantId: '58fcdb5a-b604-44bf-8c46-3bd89bc940b0',
      publicKeyMultibase,
      privateKeyMultibase,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      nextStatusIndex: 5,
      revokedIndices: [] as { statusListIndex: number }[],
      ...overrides,
    };
  }

  it('returns a signed VC with proof', async () => {
    const result = (await signStatusListCredential(makeParams())) as any;
    expect(result.proof).toBeDefined();
    expect(result.proof.proofValue).toBeTruthy();
  });

  it('has DataIntegrityProof with eddsa-rdfc-2022', async () => {
    const result = (await signStatusListCredential(makeParams())) as any;
    expect(result.proof.type).toBe('DataIntegrityProof');
    expect(result.proof.cryptosuite).toBe('eddsa-rdfc-2022');
  });

  it('has correct @context', async () => {
    const result = (await signStatusListCredential(makeParams())) as any;
    expect(result['@context']).toContain('https://www.w3.org/ns/credentials/v2');
    expect(result['@context']).toContain('https://www.w3.org/ns/credentials/status/v1');
  });

  it('has correct types', async () => {
    const result = (await signStatusListCredential(makeParams())) as any;
    expect(result.type).toContain('VerifiableCredential');
    expect(result.type).toContain('BitstringStatusListCredential');
  });

  it('has did:key issuer', async () => {
    const result = (await signStatusListCredential(makeParams())) as any;
    expect(result.issuer).toBe(`did:key:${publicKeyMultibase}`);
  });

  it('has BitstringStatusList credentialSubject', async () => {
    const result = (await signStatusListCredential(makeParams())) as any;
    expect(result.credentialSubject.type).toBe('BitstringStatusList');
    expect(result.credentialSubject.statusPurpose).toBe('revocation');
    expect(result.credentialSubject.encodedList).toBeTruthy();
  });

  it('includes validFrom', async () => {
    const result = (await signStatusListCredential(makeParams())) as any;
    expect(result.validFrom).toBe('2026-01-01T00:00:00.000Z');
  });

  it('proof has assertionMethod purpose', async () => {
    const result = (await signStatusListCredential(makeParams())) as any;
    expect(result.proof.proofPurpose).toBe('assertionMethod');
  });

  it('proof verificationMethod references did:key', async () => {
    const result = (await signStatusListCredential(makeParams())) as any;
    expect(result.proof.verificationMethod).toBe(
      `did:key:${publicKeyMultibase}#${publicKeyMultibase}`,
    );
  });
});
