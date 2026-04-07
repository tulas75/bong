/**
 * @module routes/badges
 * Protected route `POST /api/v1/badges` for creating badge classes
 * under the authenticated tenant.
 */

import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { createBadgeClassSchema } from '../lib/schemas.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * Create a new badge class for the authenticated tenant.
 * Validates the request body against {@link createBadgeClassSchema}.
 *
 * @route POST /api/v1/badges
 * @auth Requires `X-API-Key` header.
 * @returns 201 — Created badge class.
 * @returns 400 — Validation error.
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createBadgeClassSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const badge = await prisma.badgeClass.create({
    data: {
      tenantId: req.tenant!.id,
      ...parsed.data,
    },
  });

  res.status(201).json(badge);
});

export default router;
