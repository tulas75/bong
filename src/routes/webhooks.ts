import { Router, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { prismaUnfiltered } from '../lib/prisma.js';
import { courseCompletionWebhookSchema } from '../lib/schemas.js';
import { issueBadge } from '../services/issuance.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { audit } from '../lib/logger.js';

const router = Router();

router.post('/course-completed', async (req: AuthenticatedRequest, res: Response) => {
  // Verify webhook signature if tenant has a webhook secret
  if (req.tenant!.webhookSecret) {
    const signature = req.headers['x-webhook-signature'] as string | undefined;
    if (!signature) {
      res.status(401).json({ error: 'Missing X-Webhook-Signature header' });
      return;
    }

    const expectedSig = createHmac('sha256', req.tenant!.webhookSecret)
      .update((req as any).rawBody)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      audit.warn({ tenantId: req.tenant!.id, ip: req.ip }, 'webhook_signature_invalid');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
  }

  const parsed = courseCompletionWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { payload } = parsed.data;
  const courseId = String(payload.course.id);

  // Find the BadgeClass linked to this course
  const badgeClass = await prisma.badgeClass.findFirst({
    where: {
      externalCourseId: courseId,
      tenantId: req.tenant!.id,
    },
  });

  if (!badgeClass) {
    res.status(404).json({
      error: `No BadgeClass found for externalCourseId "${courseId}"`,
    });
    return;
  }

  const recipientEmail = payload.user.email;
  const recipientName = `${payload.user.first_name} ${payload.user.last_name}`;

  let result;
  try {
    result = await issueBadge({
      prisma: prismaUnfiltered,
      tenant: req.tenant!,
      badgeClass,
      recipientEmail,
      recipientName,
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
      badgeClassId: badgeClass.id,
      recipientEmail,
      courseId,
      ip: req.ip,
    },
    'assertion_issued_via_webhook',
  );

  res.status(201).json(result.assertion);
});

export default router;
