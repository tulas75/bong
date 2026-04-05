import { PrismaClient } from '../generated/prisma/client.js';
import { v4 as uuidv4 } from 'uuid';
import { issueCredential, Cryptosuite } from './credential.js';
import { sendBadgeIssuedEmail } from './email.js';
import { bakeCredentialImage } from './baking.js';
import { logger } from '../lib/logger.js';

const APP_DOMAIN = process.env.APP_DOMAIN || 'localhost:3000';

interface IssueBadgeParams {
  prisma: PrismaClient;
  cryptosuite?: Cryptosuite;
  tenant: {
    id: string;
    name: string;
    url: string;
    imageUrl?: string | null;
    publicKeyMultibase: string;
    privateKeyMultibase: string;
    p256PublicKeyMultibase?: string | null;
    p256PrivateKeyMultibase?: string | null;
  };
  badgeClass: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    criteria: string;
    achievementType?: string;
  };
  recipientEmail: string;
  recipientName: string;
  expiresAt?: Date;
}

export async function issueBadge(params: IssueBadgeParams) {
  const { prisma, cryptosuite, tenant, badgeClass, recipientEmail, recipientName, expiresAt } =
    params;
  const assertionId = uuidv4();
  const issuedOn = new Date();

  // Atomic transaction: claim status index → sign credential → create assertion
  const assertion = await prisma.$transaction(async (tx) => {
    // 1. Atomically increment and claim the next status index
    const updated = await tx.tenant.update({
      where: { id: tenant.id },
      data: { nextStatusIndex: { increment: 1 } },
    });
    const statusListIndex = updated.nextStatusIndex - 1;

    // 2. Sign the credential (includes credentialStatus with the index)
    const { credential: signedCredential, salt } = await issueCredential({
      assertionId,
      cryptosuite,
      tenant,
      badgeClass,
      recipientEmail,
      recipientName,
      issuedOn,
      expiresAt,
      statusListIndex,
    });

    // 3. Persist the assertion
    return tx.assertion.create({
      data: {
        id: assertionId,
        badgeClassId: badgeClass.id,
        tenantId: tenant.id,
        recipientEmail,
        recipientName,
        issuedOn,
        expiresAt: expiresAt || null,
        statusListIndex,
        recipientSalt: salt,
        payloadJson: signedCredential as any,
      },
    });
  });

  // 4. Bake credential into badge image (best-effort — never blocks issuance)
  const verifyUrl = `https://${APP_DOMAIN}/verify/${assertion.id}`;
  const credentialJson = JSON.stringify(assertion.payloadJson);
  let bakedImage: { buffer: Buffer; filename: string } | null = null;
  try {
    const baked = await bakeCredentialImage(badgeClass.imageUrl, credentialJson);
    if (baked) {
      bakedImage = {
        buffer: baked.buffer,
        filename: `badge-${assertion.id}.${baked.extension}`,
      };
    }
  } catch (err) {
    logger.warn({ err, assertionId: assertion.id }, 'baking_skipped');
  }

  // 5. Send email notification (outside transaction — never blocks issuance)
  await sendBadgeIssuedEmail({
    recipientEmail,
    recipientName,
    badgeName: badgeClass.name,
    badgeDescription: badgeClass.description,
    badgeImageUrl: badgeClass.imageUrl,
    issuerName: tenant.name,
    verifyUrl,
    expiresAt: expiresAt || null,
    bakedImage,
  });

  return { assertion, verifyUrl };
}
