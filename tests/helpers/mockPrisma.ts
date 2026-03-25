import { vi } from 'vitest';

export const mockPrisma = {
  tenant: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  badgeClass: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  assertion: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
};
