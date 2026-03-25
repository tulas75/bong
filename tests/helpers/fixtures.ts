export function makeTenant(overrides: Record<string, any> = {}) {
  return {
    id: '58fcdb5a-b604-44bf-8c46-3bd89bc940b0',
    name: 'Test Academy',
    url: 'https://test.example.com',
    publicKeyMultibase: 'z6MkfakePublicKey',
    privateKeyMultibase: 'encrypted-private-key',
    apiKeyPrefix: 'aabbccdd',
    apiKey: '$argon2id$placeholder',
    webhookSecret: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeBadgeClass(overrides: Record<string, any> = {}) {
  return {
    id: '622cf501-bf52-47f5-a5a0-c7f168f3d6bc',
    tenantId: '58fcdb5a-b604-44bf-8c46-3bd89bc940b0',
    name: 'Test Badge',
    description: 'A test badge',
    imageUrl: 'https://example.com/badge.png',
    criteria: 'Complete the test',
    externalCourseId: '12345',
    templateHtml: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeAssertion(overrides: Record<string, any> = {}) {
  return {
    id: '72910be6-cbde-441c-b602-484884dbc28e',
    badgeClassId: '622cf501-bf52-47f5-a5a0-c7f168f3d6bc',
    recipientEmail: 'user@example.com',
    recipientName: 'Test User',
    issuedOn: new Date('2026-01-15'),
    expiresAt: null,
    revokedAt: null,
    revocationReason: null,
    payloadJson: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'OpenBadgeCredential'],
      proof: { type: 'Ed25519Signature2020', proofValue: 'mock' },
    },
    ...overrides,
  };
}
