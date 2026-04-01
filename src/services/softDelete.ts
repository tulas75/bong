import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Soft-delete a tenant and cascade to its badge classes.
 * Assertions are intentionally LEFT UNTOUCHED so historical credentials remain accessible.
 */
export async function softDeleteTenant(prisma: PrismaClient, tenantId: string) {
  const now = new Date();

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { deletedAt: now },
  });

  await prisma.badgeClass.updateMany({
    where: { tenantId, deletedAt: null },
    data: { deletedAt: now },
  });
}

/**
 * Soft-delete a badge class. Assertions are NOT cascaded.
 */
export async function softDeleteBadgeClass(prisma: PrismaClient, badgeClassId: string) {
  await prisma.badgeClass.update({
    where: { id: badgeClassId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Soft-delete an assertion (hides from listings, but remains verifiable).
 */
export async function softDeleteAssertion(prisma: PrismaClient, assertionId: string) {
  await prisma.assertion.update({
    where: { id: assertionId },
    data: { deletedAt: new Date() },
  });
}
