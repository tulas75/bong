import "dotenv/config";
import { Command } from "commander";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { Ed25519VerificationKey2020 } from "@digitalcredentials/ed25519-verification-key-2020";
import { randomUUID } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { issueCredential } from "./services/credential.js";
import {
  encryptField,
  decryptField,
  getEncryptionKey,
  hashApiKey,
  extractApiKeyPrefix,
} from "./lib/crypto.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter } as any);

const program = new Command();

program
  .name("bong")
  .description("BONG — Badge Object Node Gateway CLI")
  .version("1.0.0");

// ─── Tenant commands ─────────────────────────────────────────────

const tenant = program.command("tenant").description("Manage tenants");

tenant
  .command("create")
  .description("Create a new tenant with auto-generated keys")
  .requiredOption("--name <name>", "Organization name")
  .requiredOption("--url <url>", "Organization URL")
  .option("--webhook-secret <secret>", "HMAC secret for webhook signature verification")
  .action(async (opts) => {
    const encryptionKey = getEncryptionKey();

    const keyPair = await Ed25519VerificationKey2020.generate();
    const exported = keyPair.export({ publicKey: true, privateKey: true });
    const rawApiKey = `bong_${randomUUID().replace(/-/g, "")}`;

    const apiKeyHash = await hashApiKey(rawApiKey);

    const t = await prisma.tenant.create({
      data: {
        name: opts.name,
        url: opts.url,
        publicKeyMultibase: exported.publicKeyMultibase!,
        privateKeyMultibase: encryptField(exported.privateKeyMultibase!, encryptionKey),
        apiKeyPrefix: extractApiKeyPrefix(rawApiKey),
        apiKey: apiKeyHash,
        webhookSecret: opts.webhookSecret
          ? encryptField(opts.webhookSecret, encryptionKey)
          : null,
      },
    });

    console.log("\nTenant created:");
    console.log(`  ID:             ${t.id}`);
    console.log(`  Name:           ${t.name}`);
    console.log(`  URL:            ${t.url}`);
    console.log(`  API Key:        ${rawApiKey}  (save this — it cannot be retrieved)`);
    console.log(`  Public Key:     ${t.publicKeyMultibase}`);
    console.log(`  Webhook secret: ${opts.webhookSecret ? "set" : "(none)"}`);
  });

tenant
  .command("list")
  .description("List all tenants")
  .action(async () => {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (tenants.length === 0) {
      console.log("No tenants found.");
      return;
    }

    console.log(`\n${"ID".padEnd(38)} ${"Name".padEnd(30)} ${"URL".padEnd(40)} API Key Hash`);
    console.log("─".repeat(140));
    for (const t of tenants) {
      console.log(
        `${t.id.padEnd(38)} ${t.name.padEnd(30)} ${t.url.padEnd(40)} ${t.apiKey.substring(0, 16)}...`
      );
    }
    console.log(`\nTotal: ${tenants.length}`);
  });

tenant
  .command("delete <id>")
  .description("Delete a tenant and all its badge classes and assertions")
  .action(async (id) => {
    const t = await prisma.tenant.findUnique({ where: { id } });
    if (!t) {
      console.error(`Tenant "${id}" not found.`);
      process.exit(1);
    }

    // Delete in order: assertions → badge classes → tenant
    const badgeClasses = await prisma.badgeClass.findMany({
      where: { tenantId: id },
      select: { id: true },
    });
    const badgeClassIds = badgeClasses.map((b) => b.id);

    const deletedAssertions = await prisma.assertion.deleteMany({
      where: { badgeClassId: { in: badgeClassIds } },
    });
    const deletedBadges = await prisma.badgeClass.deleteMany({
      where: { tenantId: id },
    });
    await prisma.tenant.delete({ where: { id } });

    console.log(`\nDeleted tenant "${t.name}":`);
    console.log(`  Badge classes removed: ${deletedBadges.count}`);
    console.log(`  Assertions removed:    ${deletedAssertions.count}`);
  });

tenant
  .command("rotate-key <id>")
  .description("Rotate the API key for a tenant (re-hashes with Argon2id)")
  .action(async (id) => {
    const t = await prisma.tenant.findUnique({ where: { id } });
    if (!t) {
      console.error(`Tenant "${id}" not found.`);
      process.exit(1);
    }

    const rawApiKey = `bong_${randomUUID().replace(/-/g, "")}`;
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

const badge = program.command("badge").description("Manage badge classes");

badge
  .command("create")
  .description("Create a new badge class for a tenant")
  .requiredOption("--tenant <tenantId>", "Tenant ID")
  .requiredOption("--name <name>", "Badge name")
  .requiredOption("--description <desc>", "Badge description")
  .requiredOption("--image <url>", "Badge image URL")
  .requiredOption("--criteria <criteria>", "Criteria to earn the badge")
  .option("--course-id <courseId>", "External course ID (for LMS webhooks)")
  .option("--template <filePath>", "Path to custom HTML template file")
  .action(async (opts) => {
    const t = await prisma.tenant.findUnique({ where: { id: opts.tenant } });
    if (!t) {
      console.error(`Tenant "${opts.tenant}" not found.`);
      process.exit(1);
    }

    let templateHtml: string | null = null;
    if (opts.template) {
      const fs = await import("fs");
      templateHtml = fs.readFileSync(opts.template, "utf-8");
    }

    const b = await prisma.badgeClass.create({
      data: {
        tenantId: opts.tenant,
        name: opts.name,
        description: opts.description,
        imageUrl: opts.image,
        criteria: opts.criteria,
        externalCourseId: opts.courseId || null,
        templateHtml,
      },
    });

    console.log("\nBadge class created:");
    console.log(`  ID:                ${b.id}`);
    console.log(`  Name:              ${b.name}`);
    console.log(`  Tenant:            ${t.name}`);
    console.log(`  External Course ID: ${b.externalCourseId || "(none)"}`);
    console.log(`  Custom template:   ${templateHtml ? "yes" : "(default)"}`);
  });

badge
  .command("list")
  .description("List badge classes, optionally filtered by tenant")
  .option("--tenant <tenantId>", "Filter by tenant ID")
  .action(async (opts) => {
    const where = opts.tenant ? { tenantId: opts.tenant } : {};
    const badges = await prisma.badgeClass.findMany({
      where,
      include: { tenant: true, _count: { select: { assertions: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (badges.length === 0) {
      console.log("No badge classes found.");
      return;
    }

    console.log(`\n${"ID".padEnd(38)} ${"Name".padEnd(30)} ${"Tenant".padEnd(20)} ${"Course ID".padEnd(12)} Assertions`);
    console.log("─".repeat(120));
    for (const b of badges) {
      console.log(
        `${b.id.padEnd(38)} ${b.name.padEnd(30)} ${b.tenant.name.padEnd(20)} ${(b.externalCourseId || "-").padEnd(12)} ${b._count.assertions}`
      );
    }
    console.log(`\nTotal: ${badges.length}`);
  });

badge
  .command("delete <id>")
  .description("Delete a badge class and all its assertions")
  .action(async (id) => {
    const b = await prisma.badgeClass.findUnique({ where: { id } });
    if (!b) {
      console.error(`Badge class "${id}" not found.`);
      process.exit(1);
    }

    const deletedAssertions = await prisma.assertion.deleteMany({
      where: { badgeClassId: id },
    });
    await prisma.badgeClass.delete({ where: { id } });

    console.log(`\nDeleted badge class "${b.name}":`);
    console.log(`  Assertions removed: ${deletedAssertions.count}`);
  });

badge
  .command("issue <badgeId>")
  .description("Issue a badge to a user")
  .requiredOption("--email <email>", "Recipient email")
  .requiredOption("--name <name>", "Recipient name")
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
      privateKeyMultibase: decryptField(
        badgeClass.tenant.privateKeyMultibase,
        encryptionKey
      ),
    };

    const assertionId = uuidv4();
    const issuedOn = new Date();

    const signedCredential = await issueCredential({
      assertionId,
      tenant: tenantDecrypted,
      badgeClass,
      recipientEmail: opts.email,
      recipientName: opts.name,
      issuedOn,
    });

    const assertion = await prisma.assertion.create({
      data: {
        id: assertionId,
        badgeClassId: badgeId,
        recipientEmail: opts.email,
        recipientName: opts.name,
        issuedOn,
        payloadJson: signedCredential as any,
      },
    });

    const appDomain = process.env.APP_DOMAIN || "localhost:3000";
    console.log("\nBadge issued:");
    console.log(`  Assertion ID: ${assertion.id}`);
    console.log(`  Badge:        ${badgeClass.name}`);
    console.log(`  Recipient:    ${opts.name} <${opts.email}>`);
    console.log(`  Issued On:    ${issuedOn.toISOString().split("T")[0]}`);
    console.log(`  Verify URL:   https://${appDomain}/verify/${assertion.id}`);
  });

// ─── Stats command ───────────────────────────────────────────────

program
  .command("stats")
  .description("Show overview statistics")
  .action(async () => {
    const tenants = await prisma.tenant.findMany({
      include: {
        badgeClasses: {
          include: { _count: { select: { assertions: true } } },
        },
      },
      orderBy: { name: "asc" },
    });

    const totalTenants = tenants.length;
    let totalBadges = 0;
    let totalAssertions = 0;

    console.log("\n=== BONG Stats ===\n");

    if (totalTenants === 0) {
      console.log("No tenants yet. Create one with: bong tenant create --name <name> --url <url>");
      return;
    }

    for (const t of tenants) {
      const badgeCount = t.badgeClasses.length;
      const assertionCount = t.badgeClasses.reduce(
        (sum, b) => sum + b._count.assertions,
        0
      );
      totalBadges += badgeCount;
      totalAssertions += assertionCount;

      console.log(`${t.name} (${t.id})`);
      console.log(`  Badges: ${badgeCount}   Assertions: ${assertionCount}`);

      if (badgeCount > 0) {
        for (const b of t.badgeClasses) {
          console.log(
            `    - ${b.name} [${b.externalCourseId || "no course ID"}] → ${b._count.assertions} issued`
          );
        }
      }
      console.log();
    }

    console.log("─".repeat(40));
    console.log(`Tenants: ${totalTenants}   Badges: ${totalBadges}   Assertions: ${totalAssertions}`);
  });

program.parseAsync().then(() => process.exit(0));
