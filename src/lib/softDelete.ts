/**
 * @module softDelete
 * Prisma client extension that intercepts queries on soft-delete-aware
 * models (Tenant, BadgeClass, Assertion). Read operations automatically filter out
 * records where `deletedAt` is set; `delete` / `deleteMany` are converted to
 * `update` / `updateMany` that set `deletedAt` to the current timestamp.
 */

import { PrismaClient } from '../generated/prisma/client.js';

/** Models that support soft-delete behaviour. */
const SOFT_DELETE_MODELS = new Set(['Tenant', 'BadgeClass', 'Assertion']);
/** Prisma operations that read data and should auto-filter deleted records. */
const READ_OPERATIONS = new Set(['findUnique', 'findFirst', 'findMany', 'count']);

/**
 * Wrap a Prisma client with the soft-delete extension.
 * @param client - The base {@link PrismaClient} instance.
 * @returns An extended client that transparently handles soft-deletes.
 */
export function withSoftDelete<T extends PrismaClient>(client: T) {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SOFT_DELETE_MODELS.has(model)) {
            return query(args);
          }

          // Auto-filter soft-deleted records on reads
          if (READ_OPERATIONS.has(operation)) {
            (args as any).where = { ...(args as any).where, deletedAt: null };
            return query(args);
          }

          // Convert delete to soft-delete update
          if (operation === 'delete') {
            const modelAccessor = model.charAt(0).toLowerCase() + model.slice(1);
            return (client as any)[modelAccessor].update({
              where: (args as any).where,
              data: { deletedAt: new Date() },
            });
          }
          if (operation === 'deleteMany') {
            const modelAccessor = model.charAt(0).toLowerCase() + model.slice(1);
            return (client as any)[modelAccessor].updateMany({
              where: (args as any).where,
              data: { deletedAt: new Date() },
            });
          }

          return query(args);
        },
      },
    },
  });
}
