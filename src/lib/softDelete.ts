import { PrismaClient } from '../generated/prisma/client.js';

const SOFT_DELETE_MODELS = new Set(['Tenant', 'BadgeClass', 'Assertion']);
const READ_OPERATIONS = new Set(['findUnique', 'findFirst', 'findMany', 'count']);

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
