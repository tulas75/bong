import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { prismaUnfiltered } from '../lib/prisma.js';
import { createAssertionSchema, revokeAssertionSchema } from '../lib/schemas.js';
import { issueBadge } from '../services/issuance.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { audit } from '../lib/logger.js';

const router = Router();

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createAssertionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { badgeClassId, recipientEmail, recipientName, expiresAt: expiresAtStr } = parsed.data;

  const badgeClass = await prisma.badgeClass.findFirst({
    where: { id: badgeClassId, tenantId: req.tenant!.id },
  });

  if (!badgeClass) {
    res.status(404).json({ error: 'BadgeClass not found' });
    return;
  }

  const expiresAt = expiresAtStr ? new Date(expiresAtStr) : undefined;

  let result;
  try {
    result = await issueBadge({
      prisma: prismaUnfiltered,
      tenant: req.tenant!,
      badgeClass,
      recipientEmail,
      recipientName,
      expiresAt,
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Badge already issued to this recipient' });
      return;
    }
    throw err;
  }

  audit.info(
    {
      tenantId: req.tenant!.id,
      assertionId: result.assertion.id,
      badgeClassId,
      recipientEmail,
      ip: req.ip,
    },
    'assertion_issued',
  );

  res.status(201).json(result.assertion);
});

router.post('/:id/revoke', async (req: AuthenticatedRequest, res: Response) => {
  const assertionId = req.params.id as string;

  const parsed = revokeAssertionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const assertion = await prisma.assertion.findUnique({
    where: { id: assertionId },
    include: { badgeClass: true },
  });

  if (!assertion) {
    res.status(404).json({ error: 'Assertion not found' });
    return;
  }

  if (assertion.badgeClass.tenantId !== req.tenant!.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (assertion.revokedAt) {
    res.status(409).json({ error: 'Assertion already revoked' });
    return;
  }

  const updated = await prisma.assertion.update({
    where: { id: assertionId },
    data: {
      revokedAt: new Date(),
      revocationReason: parsed.data.reason,
    },
  });

  audit.info(
    { tenantId: req.tenant!.id, assertionId, reason: parsed.data.reason, ip: req.ip },
    'assertion_revoked',
  );

  res.json(updated);
});

export default router;
