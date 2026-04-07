import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (vi.hoisted runs before hoisted vi.mock calls) ──────

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma: any = {
    tenant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    badgeClass: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    assertion: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn(),
}));

vi.mock('../../src/generated/prisma/client.js', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma;
    }
  },
}));

vi.mock('../../src/lib/softDelete.js', () => ({
  withSoftDelete: (client: any) => client,
}));

vi.mock('dotenv/config', () => ({}));

vi.mock('@digitalbazaar/ed25519-multikey', () => ({
  generate: vi.fn().mockResolvedValue({
    export: vi.fn().mockResolvedValue({
      publicKeyMultibase: 'z6MkTestEdKey',
      secretKeyMultibase: 'z3vTestEdSecret',
    }),
  }),
}));

vi.mock('@digitalbazaar/ecdsa-multikey', () => ({
  generate: vi.fn().mockResolvedValue({
    export: vi.fn().mockResolvedValue({
      publicKeyMultibase: 'zDnTestP256Key',
      secretKeyMultibase: 'z42TestP256Secret',
    }),
  }),
}));

vi.mock('../../src/lib/crypto.js', () => ({
  getEncryptionKey: vi.fn().mockReturnValue('a'.repeat(64)),
  encryptField: vi.fn().mockReturnValue('encrypted-value'),
  decryptField: vi.fn().mockReturnValue('decrypted-value'),
  hashApiKey: vi.fn().mockResolvedValue('$argon2id$hashed'),
  extractApiKeyPrefix: vi.fn().mockReturnValue('abcd1234'),
}));

vi.mock('../../src/services/issuance.js', () => ({
  issueBadge: vi.fn().mockResolvedValue({
    assertion: {
      id: 'new-assertion-id',
      issuedOn: new Date('2026-04-07'),
    },
    verifyUrl: 'https://test.example.com/verify/new-assertion-id',
  }),
}));

vi.mock('../../src/services/softDelete.js', () => ({
  softDeleteTenant: vi.fn(),
  softDeleteBadgeClass: vi.fn(),
  softDeleteAssertion: vi.fn(),
}));

import { program } from '../../src/cli';

// ─── Helpers ────────────────────────────────────────────────────

let logs: string[] = [];
let errors: string[] = [];

beforeEach(() => {
  vi.restoreAllMocks();
  logs = [];
  errors = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')));
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as any);
});

async function run(...args: string[]) {
  await program.parseAsync(['node', 'bong', ...args]);
}

// ─── Tenant commands ────────────────────────────────────────────

describe('bong tenant create', () => {
  it('creates a tenant and prints details', async () => {
    mockPrisma.tenant.create.mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
      url: 'https://acme.edu',
      imageUrl: null,
      publicKeyMultibase: 'z6MkTestEdKey',
      p256PublicKeyMultibase: 'zDnTestP256Key',
    });

    await run('tenant', 'create', '--name', 'Acme', '--url', 'https://acme.edu');

    expect(mockPrisma.tenant.create).toHaveBeenCalledOnce();
    const output = logs.join('\n');
    expect(output).toContain('Tenant created');
    expect(output).toContain('Acme');
    expect(output).toContain('bong_');
  });
});

describe('bong tenant list', () => {
  it('lists tenants', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-1',
        name: 'Acme',
        url: 'https://acme.edu',
        apiKey: '$argon2id$longhashvalue1234',
      },
    ]);

    await run('tenant', 'list');

    const output = logs.join('\n');
    expect(output).toContain('Acme');
    expect(output).toContain('Total: 1');
  });

  it('shows message when no tenants', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([]);
    await run('tenant', 'list');
    expect(logs.join('\n')).toContain('No tenants found');
  });
});

describe('bong tenant delete', () => {
  it('soft-deletes a tenant', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
    });

    await run('tenant', 'delete', 'tenant-1');

    const { softDeleteTenant } = await import('../../src/services/softDelete.js');
    expect(softDeleteTenant).toHaveBeenCalledWith(expect.anything(), 'tenant-1');
    expect(logs.join('\n')).toContain('marked as deleted');
  });

  it('exits with error for unknown tenant', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    await expect(run('tenant', 'delete', 'unknown-id')).rejects.toThrow('process.exit(1)');
    expect(errors.join('\n')).toContain('not found');
  });
});

describe('bong tenant rotate-key', () => {
  it('rotates API key', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
    });
    mockPrisma.tenant.update.mockResolvedValue({});

    await run('tenant', 'rotate-key', 'tenant-1');

    expect(mockPrisma.tenant.update).toHaveBeenCalledOnce();
    const output = logs.join('\n');
    expect(output).toContain('rotated');
    expect(output).toContain('bong_');
  });
});

// ─── Badge commands ─────────────────────────────────────────────

describe('bong badge create', () => {
  it('creates a badge class', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
    });
    mockPrisma.badgeClass.create.mockResolvedValue({
      id: 'badge-1',
      name: 'Python 101',
      externalCourseId: null,
    });

    await run(
      'badge',
      'create',
      '--tenant',
      'tenant-1',
      '--name',
      'Python 101',
      '--description',
      'Learn Python',
      '--image',
      'https://example.com/badge.png',
      '--criteria',
      'Pass the exam',
    );

    expect(mockPrisma.badgeClass.create).toHaveBeenCalledOnce();
    expect(logs.join('\n')).toContain('Badge class created');
  });
});

describe('bong badge list', () => {
  it('lists badges with counts', async () => {
    mockPrisma.badgeClass.findMany.mockResolvedValue([
      {
        id: 'badge-1',
        name: 'Python 101',
        externalCourseId: 'PY101',
        tenant: { name: 'Acme' },
        _count: { assertions: 5 },
      },
    ]);

    await run('badge', 'list');

    const output = logs.join('\n');
    expect(output).toContain('Python 101');
    expect(output).toContain('Acme');
    expect(output).toContain('5');
  });
});

describe('bong badge delete', () => {
  it('soft-deletes a badge class', async () => {
    mockPrisma.badgeClass.findUnique.mockResolvedValue({
      id: 'badge-1',
      name: 'Python 101',
    });

    await run('badge', 'delete', 'badge-1');

    const { softDeleteBadgeClass } = await import('../../src/services/softDelete.js');
    expect(softDeleteBadgeClass).toHaveBeenCalledWith(expect.anything(), 'badge-1');
    expect(logs.join('\n')).toContain('marked as deleted');
  });
});

// ─── Assertion commands ─────────────────────────────────────────

describe('bong assertion list', () => {
  it('lists assertions with status', async () => {
    mockPrisma.assertion.findMany.mockResolvedValue([
      {
        id: 'assert-1',
        recipientName: 'Mario Rossi',
        issuedOn: new Date('2026-03-01'),
        revokedAt: null,
        expiresAt: null,
        badgeClass: { name: 'Python 101', tenant: { name: 'Acme' } },
      },
    ]);

    await run('assertion', 'list');

    const output = logs.join('\n');
    expect(output).toContain('Mario Rossi');
    expect(output).toContain('Python 101');
    expect(output).toContain('active');
  });

  it('shows REVOKED status', async () => {
    mockPrisma.assertion.findMany.mockResolvedValue([
      {
        id: 'assert-1',
        recipientName: 'Mario Rossi',
        issuedOn: new Date('2026-03-01'),
        revokedAt: new Date('2026-04-01'),
        expiresAt: null,
        badgeClass: { name: 'Python 101', tenant: { name: 'Acme' } },
      },
    ]);

    await run('assertion', 'list');
    expect(logs.join('\n')).toContain('REVOKED');
  });
});

describe('bong assertion revoke', () => {
  it('revokes an assertion', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue({
      id: 'assert-1',
      revokedAt: null,
      badgeClass: { name: 'Python 101' },
    });
    mockPrisma.assertion.update.mockResolvedValue({});

    await run('assertion', 'revoke', 'assert-1', '--reason', 'Issued by mistake');

    expect(mockPrisma.assertion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assert-1' },
        data: expect.objectContaining({ revocationReason: 'Issued by mistake' }),
      }),
    );
    expect(logs.join('\n')).toContain('revoked');
  });

  it('rejects already revoked assertion', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue({
      id: 'assert-1',
      revokedAt: new Date('2026-04-01'),
    });

    await expect(run('assertion', 'revoke', 'assert-1', '--reason', 'test')).rejects.toThrow(
      'process.exit(1)',
    );
    expect(errors.join('\n')).toContain('already revoked');
  });
});

describe('bong assertion delete', () => {
  it('soft-deletes an assertion', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue({ id: 'assert-1' });

    await run('assertion', 'delete', 'assert-1');

    const { softDeleteAssertion } = await import('../../src/services/softDelete.js');
    expect(softDeleteAssertion).toHaveBeenCalledWith(expect.anything(), 'assert-1');
    expect(logs.join('\n')).toContain('marked as deleted');
  });
});

describe('bong assertion anonymize', () => {
  it('anonymizes an assertion', async () => {
    mockPrisma.assertion.findUnique.mockResolvedValue({
      id: 'assert-1',
      deletedAt: null,
    });
    mockPrisma.assertion.update.mockResolvedValue({});

    await run('assertion', 'anonymize', 'assert-1');

    expect(mockPrisma.assertion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: 'redacted@anonymized.invalid',
          recipientName: 'Anonymized User',
          payloadJson: { status: 'anonymized' },
        }),
      }),
    );
    expect(logs.join('\n')).toContain('irreversibly anonymized');
  });
});

// ─── Stats command ──────────────────────────────────────────────

describe('bong stats', () => {
  it('shows overview statistics', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-1',
        name: 'Acme',
        badgeClasses: [
          { name: 'Python 101', externalCourseId: 'PY101', _count: { assertions: 3 } },
          { name: 'React Adv', externalCourseId: null, _count: { assertions: 7 } },
        ],
      },
    ]);

    await run('stats');

    const output = logs.join('\n');
    expect(output).toContain('BONG Stats');
    expect(output).toContain('Acme');
    expect(output).toContain('Tenants: 1');
    expect(output).toContain('Badges: 2');
    expect(output).toContain('Assertions: 10');
  });

  it('shows message when no tenants', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([]);
    await run('stats');
    expect(logs.join('\n')).toContain('No tenants yet');
  });
});
