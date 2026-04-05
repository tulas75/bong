#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey';
import { randomUUID } from 'crypto';
import { issueBadge } from './services/issuance.js';
import {
  encryptField,
  decryptField,
  getEncryptionKey,
  hashApiKey,
  extractApiKeyPrefix,
} from './lib/crypto.js';
import { withSoftDelete } from './lib/softDelete.js';
import {
  softDeleteTenant,
  softDeleteBadgeClass,
  softDeleteAssertion,
} from './services/softDelete.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const basePrisma = new PrismaClient({ adapter } as any);
const prisma = withSoftDelete(basePrisma);

const program = new Command();

program.name('bong').description('BONG — Badge Object Node Gateway CLI').version('1.0.0');

// ─── Tenant commands ─────────────────────────────────────────────

const tenant = program.command('tenant').description('Manage tenants');

tenant
  .command('create')
  .description('Create a new tenant with auto-generated keys')
  .requiredOption('--name <name>', 'Organization name')
  .requiredOption('--url <url>', 'Organization URL')
  .option('--image <imageUrl>', 'Organization logo/image URL')
  .option('--webhook-secret <secret>', 'HMAC secret for webhook signature verification')
  .action(async (opts) => {
    const encryptionKey = getEncryptionKey();

    // Generate Ed25519 key pair (eddsa-rdfc-2022)
    const edKeyPair = await Ed25519Multikey.generate();
    const edExported = await edKeyPair.export({ publicKey: true, secretKey: true });

    // Generate P-256 key pair (ecdsa-sd-2023)
    const p256KeyPair = await EcdsaMultikey.generate({ curve: 'P-256' });
    const p256Exported = await p256KeyPair.export({ publicKey: true, secretKey: true });

    const rawApiKey = `bong_${randomUUID().replace(/-/g, '')}`;
    const apiKeyHash = await hashApiKey(rawApiKey);

    const t = await prisma.tenant.create({
      data: {
        name: opts.name,
        url: opts.url,
        imageUrl: opts.image || null,
        publicKeyMultibase: edExported.publicKeyMultibase!,
        privateKeyMultibase: encryptField(edExported.secretKeyMultibase!, encryptionKey),
        p256PublicKeyMultibase: p256Exported.publicKeyMultibase!,
        p256PrivateKeyMultibase: encryptField(p256Exported.secretKeyMultibase!, encryptionKey),
        apiKeyPrefix: extractApiKeyPrefix(rawApiKey),
        apiKey: apiKeyHash,
        webhookSecret: opts.webhookSecret ? encryptField(opts.webhookSecret, encryptionKey) : null,
      },
    });

    console.log('\nTenant created:');
    console.log(`  ID:             ${t.id}`);
    console.log(`  Name:           ${t.name}`);
    console.log(`  URL:            ${t.url}`);
    console.log(`  Image:          ${t.imageUrl || '(none)'}`);
    console.log(`  API Key:        ${rawApiKey}  (save this — it cannot be retrieved)`);
    console.log(`  Ed25519 Key:    ${t.publicKeyMultibase}`);
    console.log(`  P-256 Key:      ${t.p256PublicKeyMultibase}`);
    console.log(`  Webhook secret: ${opts.webhookSecret ? 'set' : '(none)'}`);
  });

tenant
  .command('list')
  .description('List all tenants')
  .action(async () => {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });

    if (tenants.length === 0) {
      console.log('No tenants found.');
      return;
    }

    console.log(`\n${'ID'.padEnd(38)} ${'Name'.padEnd(30)} ${'URL'.padEnd(40)} API Key Hash`);
    console.log('─'.repeat(140));
    for (const t of tenants) {
      console.log(
        `${t.id.padEnd(38)} ${t.name.padEnd(30)} ${t.url.padEnd(40)} ${t.apiKey.substring(0, 16)}...`,
      );
    }
    console.log(`\nTotal: ${tenants.length}`);
  });

tenant
  .command('delete <id>')
  .description('Soft-delete a tenant and cascade to its badge classes')
  .action(async (id) => {
    const t = await prisma.tenant.findUnique({ where: { id } });
    if (!t) {
      console.error(`Tenant "${id}" not found.`);
      process.exit(1);
    }

    await softDeleteTenant(basePrisma, id);

    console.log(`\nTenant "${t.name}" marked as deleted (Soft).`);
    console.log(`  Associated badge classes have been soft-deleted.`);
    console.log(`  Existing assertions remain accessible for verification.`);
  });

tenant
  .command('rotate-key <id>')
  .description('Rotate the API key for a tenant (re-hashes with Argon2id)')
  .action(async (id) => {
    const t = await prisma.tenant.findUnique({ where: { id } });
    if (!t) {
      console.error(`Tenant "${id}" not found.`);
      process.exit(1);
    }

    const rawApiKey = `bong_${randomUUID().replace(/-/g, '')}`;
    const apiKeyHash = await hashApiKey(rawApiKey);

    await prisma.tenant.update({
      where: { id },
      data: {
        apiKeyPrefix: extractApiKeyPrefix(rawApiKey),
        apiKey: apiKeyHash,
      },
    });

    console.log(`\nAPI key rotated for tenant "${t.name}":`);
    console.log(`  API Key: ${rawApiKey}  (save this — it cannot be retrieved)`);
  });

// ─── Badge commands ──────────────────────────────────────────────

const badge = program.command('badge').description('Manage badge classes');

badge
  .command('create')
  .description('Create a new badge class for a tenant')
  .requiredOption('--tenant <tenantId>', 'Tenant ID')
  .requiredOption('--name <name>', 'Badge name')
  .requiredOption('--description <desc>', 'Badge description')
  .requiredOption('--image <url>', 'Badge image URL')
  .requiredOption('--criteria <criteria>', 'Criteria to earn the badge')
  .option('--type <type>', 'Achievement type (Badge, Certificate, Course, etc.)', 'Badge')
  .option('--course-id <courseId>', 'External course ID (for LMS webhooks)')
  .option('--template <filePath>', 'Path to custom HTML template file')
  .action(async (opts) => {
    const t = await prisma.tenant.findUnique({ where: { id: opts.tenant } });
    if (!t) {
      console.error(`Tenant "${opts.tenant}" not found.`);
      process.exit(1);
    }

    let templateHtml: string | null = null;
    if (opts.template) {
      const fs = await import('fs');
      templateHtml = fs.readFileSync(opts.template, 'utf-8');
    }

    const b = await prisma.badgeClass.create({
      data: {
        tenantId: opts.tenant,
        name: opts.name,
        description: opts.description,
        imageUrl: opts.image,
        criteria: opts.criteria,
        achievementType: opts.type,
        externalCourseId: opts.courseId || null,
        templateHtml,
      },
    });

    console.log('\nBadge class created:');
    console.log(`  ID:                ${b.id}`);
    console.log(`  Name:              ${b.name}`);
    console.log(`  Tenant:            ${t.name}`);
    console.log(`  External Course ID: ${b.externalCourseId || '(none)'}`);
    console.log(`  Custom template:   ${templateHtml ? 'yes' : '(default)'}`);
  });

badge
  .command('list')
  .description('List badge classes, optionally filtered by tenant')
  .option('--tenant <tenantId>', 'Filter by tenant ID')
  .action(async (opts) => {
    const where = opts.tenant ? { tenantId: opts.tenant } : {};
    const badges = await prisma.badgeClass.findMany({
      where,
      include: { tenant: true, _count: { select: { assertions: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (badges.length === 0) {
      console.log('No badge classes found.');
      return;
    }

    console.log(
      `\n${'ID'.padEnd(38)} ${'Name'.padEnd(30)} ${'Tenant'.padEnd(20)} ${'Course ID'.padEnd(12)} Assertions`,
    );
    console.log('─'.repeat(120));
    for (const b of badges) {
      console.log(
        `${b.id.padEnd(38)} ${b.name.padEnd(30)} ${b.tenant.name.padEnd(20)} ${(b.externalCourseId || '-').padEnd(12)} ${b._count.assertions}`,
      );
    }
    console.log(`\nTotal: ${badges.length}`);
  });

badge
  .command('delete <id>')
  .description('Soft-delete a badge class')
  .action(async (id) => {
    const b = await prisma.badgeClass.findUnique({ where: { id } });
    if (!b) {
      console.error(`Badge class "${id}" not found.`);
      process.exit(1);
    }

    await softDeleteBadgeClass(basePrisma, id);

    console.log(`\nBadge class "${b.name}" marked as deleted (Soft).`);
    console.log(`  Existing assertions remain accessible for verification.`);
  });

badge
  .command('issue <badgeId>')
  .description('Issue a badge to a user')
  .requiredOption('--email <email>', 'Recipient email')
  .requiredOption('--name <name>', 'Recipient name')
  .option('--expires <date>', 'Expiration date (ISO 8601, e.g. 2027-01-01)')
  .action(async (badgeId, opts) => {
    const badgeClass = await prisma.badgeClass.findUnique({
      where: { id: badgeId },
      include: { tenant: true },
    });
    if (!badgeClass) {
      console.error(`Badge class "${badgeId}" not found.`);
      process.exit(1);
    }

    const encryptionKey = getEncryptionKey();
    const tenantDecrypted = {
      ...badgeClass.tenant,
      privateKeyMultibase: decryptField(badgeClass.tenant.privateKeyMultibase, encryptionKey),
    };

    const expiresAt = opts.expires ? new Date(opts.expires) : undefined;

    let result;
    try {
      result = await issueBadge({
        prisma: basePrisma,
        tenant: tenantDecrypted,
        badgeClass,
        recipientEmail: opts.email,
        recipientName: opts.name,
        expiresAt,
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        console.error(`\nBadge already issued to "${opts.email}" for this badge class.`);
        process.exit(1);
      }
      throw err;
    }

    console.log('\nBadge issued:');
    console.log(`  Assertion ID: ${result.assertion.id}`);
    console.log(`  Badge:        ${badgeClass.name}`);
    console.log(`  Recipient:    ${opts.name} <${opts.email}>`);
    console.log(`  Issued On:    ${result.assertion.issuedOn.toISOString().split('T')[0]}`);
    if (expiresAt) console.log(`  Expires:      ${expiresAt.toISOString().split('T')[0]}`);
    console.log(`  Verify URL:   ${result.verifyUrl}`);
  });

// ─── Assertion commands ──────────────────────────────────────────

const assertion = program.command('assertion').description('Manage assertions');

assertion
  .command('revoke <assertionId>')
  .description('Revoke an issued assertion')
  .requiredOption('--reason <reason>', 'Reason for revocation')
  .action(async (assertionId, opts) => {
    const a = await prisma.assertion.findUnique({
      where: { id: assertionId },
      include: { badgeClass: true },
    });
    if (!a) {
      console.error(`Assertion "${assertionId}" not found.`);
      process.exit(1);
    }
    if (a.revokedAt) {
      console.error(`Assertion already revoked on ${a.revokedAt.toISOString().split('T')[0]}.`);
      process.exit(1);
    }

    await prisma.assertion.update({
      where: { id: assertionId },
      data: {
        revokedAt: new Date(),
        revocationReason: opts.reason,
      },
    });

    console.log(`\nAssertion "${assertionId}" revoked.`);
    console.log(`  Reason: ${opts.reason}`);
  });

assertion
  .command('delete <assertionId>')
  .description('Soft-delete an assertion (hides from listings)')
  .action(async (assertionId) => {
    const a = await prisma.assertion.findUnique({ where: { id: assertionId } });
    if (!a) {
      console.error(`Assertion "${assertionId}" not found.`);
      process.exit(1);
    }

    await softDeleteAssertion(basePrisma, assertionId);

    console.log(`\nAssertion "${assertionId}" marked as deleted (Soft).`);
    console.log(`  Note: To officially invalidate the credential, use "bong assertion revoke".`);
  });

assertion
  .command('bake <assertionId>')
  .description('Re-generate the baked badge image (PNG/SVG with embedded credential)')
  .option('--output <path>', 'Output file path')
  .action(async (assertionId, opts) => {
    const a = await basePrisma.assertion.findUnique({
      where: { id: assertionId },
      include: { badgeClass: true },
    });
    if (!a) {
      console.error(`Assertion "${assertionId}" not found.`);
      process.exit(1);
    }

    const { bakeCredentialImage } = await import('./services/baking.js');
    const credentialJson = JSON.stringify(a.payloadJson);
    const baked = await bakeCredentialImage(a.badgeClass.imageUrl, credentialJson);

    if (!baked) {
      console.error(
        'Failed to bake image. The badge image may be unreachable or in an unsupported format.',
      );
      process.exit(1);
    }

    const fs = await import('fs');
    const outputPath = opts.output || `./baked-badge.${baked.extension}`;
    fs.writeFileSync(outputPath, baked.buffer);
    console.log(`\nBaked badge image saved to: ${outputPath}`);
  });

assertion
  .command('anonymize <assertionId>')
  .description('GDPR: irreversibly anonymize an assertion (scramble all PII)')
  .action(async (assertionId) => {
    const a = await basePrisma.assertion.findUnique({ where: { id: assertionId } });
    if (!a) {
      console.error(`Assertion "${assertionId}" not found.`);
      process.exit(1);
    }

    await basePrisma.assertion.update({
      where: { id: assertionId },
      data: {
        recipientEmail: 'redacted@anonymized.invalid',
        recipientName: 'Anonymized User',
        payloadJson: { status: 'anonymized' },
        deletedAt: a.deletedAt ?? new Date(),
      },
    });

    console.log(`\nAssertion "${assertionId}" has been irreversibly anonymized.`);
    console.log(`  PII fields overwritten. Credential payload purged.`);
  });

assertion
  .command('list')
  .description('List issued assertions')
  .option('--badge <badgeId>', 'Filter by badge class ID')
  .option('--tenant <tenantId>', 'Filter by tenant ID')
  .action(async (opts) => {
    const where: any = {};
    if (opts.badge) where.badgeClassId = opts.badge;
    if (opts.tenant) where.badgeClass = { tenantId: opts.tenant };

    const assertions = await prisma.assertion.findMany({
      where,
      include: { badgeClass: { include: { tenant: true } } },
      orderBy: { issuedOn: 'desc' },
    });

    if (assertions.length === 0) {
      console.log('No assertions found.');
      return;
    }

    const appDomain = process.env.APP_DOMAIN || 'localhost:3000';

    console.log(
      `\n${'Recipient'.padEnd(30)} ${'Badge'.padEnd(25)} ${'Issued'.padEnd(12)} ${'Status'.padEnd(12)} Verify URL`,
    );
    console.log('─'.repeat(140));
    for (const a of assertions) {
      let status = 'active';
      if (a.revokedAt) status = 'REVOKED';
      else if (a.expiresAt && a.expiresAt < new Date()) status = 'EXPIRED';
      else if (a.expiresAt) status = `exp ${a.expiresAt.toISOString().split('T')[0]}`;

      console.log(
        `${a.recipientName.padEnd(30)} ${a.badgeClass.name.padEnd(25)} ${a.issuedOn.toISOString().split('T')[0].padEnd(12)} ${status.padEnd(12)} https://${appDomain}/verify/${a.id}`,
      );
    }
    console.log(`\nTotal: ${assertions.length}`);
  });

// ─── Stats command ───────────────────────────────────────────────

program
  .command('stats')
  .description('Show overview statistics')
  .action(async () => {
    const tenants = await prisma.tenant.findMany({
      include: {
        badgeClasses: {
          include: { _count: { select: { assertions: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    const totalTenants = tenants.length;
    let totalBadges = 0;
    let totalAssertions = 0;

    console.log('\n=== BONG Stats ===\n');

    if (totalTenants === 0) {
      console.log('No tenants yet. Create one with: bong tenant create --name <name> --url <url>');
      return;
    }

    for (const t of tenants) {
      const badgeCount = t.badgeClasses.length;
      const assertionCount = t.badgeClasses.reduce((sum, b) => sum + b._count.assertions, 0);
      totalBadges += badgeCount;
      totalAssertions += assertionCount;

      console.log(`${t.name} (${t.id})`);
      console.log(`  Badges: ${badgeCount}   Assertions: ${assertionCount}`);

      if (badgeCount > 0) {
        for (const b of t.badgeClasses) {
          console.log(
            `    - ${b.name} [${b.externalCourseId || 'no course ID'}] → ${b._count.assertions} issued`,
          );
        }
      }
      console.log();
    }

    console.log('─'.repeat(40));
    console.log(
      `Tenants: ${totalTenants}   Badges: ${totalBadges}   Assertions: ${totalAssertions}`,
    );
  });

program.parseAsync().then(() => process.exit(0));
