import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import { randomUUID } from 'crypto';
import { encryptField, getEncryptionKey, hashApiKey, extractApiKeyPrefix } from '../src/lib/crypto';

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter } as any);

  const encryptionKey = getEncryptionKey();

  console.log('Generating Ed25519 Multikey pair...');
  const keyPair = await Ed25519Multikey.generate();
  const exported = await keyPair.export({ publicKey: true, secretKey: true });

  const rawApiKey = `bong_test_${randomUUID().replace(/-/g, '')}`;

  console.log('Creating test tenant...');
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Test Academy',
      url: 'https://testacademy.example.com',
      publicKeyMultibase: exported.publicKeyMultibase!,
      privateKeyMultibase: encryptField(exported.secretKeyMultibase!, encryptionKey),
      apiKeyPrefix: extractApiKeyPrefix(rawApiKey),
      apiKey: await hashApiKey(rawApiKey),
    },
  });

  console.log('Creating test badge class...');
  const badgeClass = await prisma.badgeClass.create({
    data: {
      tenantId: tenant.id,
      externalCourseId: '987654',
      name: 'React Advanced Certification',
      description:
        'Awarded for completing the React Advanced course with a focus on hooks, performance optimization, and architecture patterns.',
      imageUrl: 'https://placehold.co/400x400/3b82f6/white?text=React+Advanced',
      criteria: 'Complete all modules and pass the final assessment with a score of 80% or higher.',
    },
  });

  console.log('\n=== Seed Complete ===');
  console.log(`Tenant ID:    ${tenant.id}`);
  console.log(`Tenant Name:  ${tenant.name}`);
  console.log(`API Key:      ${rawApiKey}  (save this — it cannot be retrieved)`);
  console.log(`BadgeClass ID: ${badgeClass.id}`);
  console.log(`External Course ID: ${badgeClass.externalCourseId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
