/**
 * @module services/softDelete
 * Cascade soft-delete operations used by the CLI.
 * Assertions are intentionally left untouched so historical credentials
 * remain accessible for verification.
 */

import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Soft-delete a tenant and cascade to its badge classes.
 * Assertions are intentionally left untouched so historical credentials remain accessible.
 * @param prisma - Base (unfiltered) Prisma client.
 * @param tenantId - UUID of the tenant to soft-delete.
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
 * Soft-delete a single badge class. Assertions are not cascaded.
 * @param prisma - Base (unfiltered) Prisma client.
 * @param badgeClassId - UUID of the badge class to soft-delete.
 */
export async function softDeleteBadgeClass(prisma: PrismaClient, badgeClassId: string) {
  await prisma.badgeClass.update({
    where: { id: badgeClassId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Soft-delete an assertion. Hides it from listings but it remains verifiable.
 * @param prisma - Base (unfiltered) Prisma client.
 * @param assertionId - UUID of the assertion to soft-delete.
 */
export async function softDeleteAssertion(prisma: PrismaClient, assertionId: string) {
  await prisma.assertion.update({
    where: { id: assertionId },
    data: { deletedAt: new Date() },
  });
}
