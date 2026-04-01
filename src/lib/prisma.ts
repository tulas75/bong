import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { withSoftDelete } from './softDelete.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const basePrisma = new PrismaClient({ adapter });

// Default client: auto-filters deleted records, converts deletes to soft-deletes
export const prisma = withSoftDelete(basePrisma);

// Unfiltered client: for public verify routes that need to traverse soft-deleted parents
export const prismaUnfiltered = basePrisma;
