import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { escapeHtml } from '../lib/crypto.js';

const router = Router();

const APP_DOMAIN = process.env.APP_DOMAIN || 'localhost:3000';

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{badgeName}} - Verified Badge</title>
  <meta property="og:title" content="{{badgeName}}" />
  <meta property="og:description" content="Issued to {{recipientName}} by {{issuerName}}" />
  <meta property="og:image" content="{{badgeImageUrl}}" />
  <meta property="og:url" content="{{verifyUrl}}" />
  <meta property="og:type" content="website" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; background: #f5f5f5; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; }
    .badge-image { max-width: 200px; border-radius: 8px; margin-bottom: 16px; }
    .verified { color: #22c55e; font-weight: 600; }
    .details { text-align: left; margin-top: 24px; }
    .details dt { font-weight: 600; color: #666; margin-top: 12px; }
    .details dd { margin-left: 0; }
    a { color: #3b82f6; }
  </style>
</head>
<body>
  <div class="card">
    <img src="{{badgeImageUrl}}" alt="{{badgeName}}" class="badge-image" />
    <h1>{{badgeName}}</h1>
    <p class="verified">Verified Credential</p>
    <dl class="details">
      <dt>Recipient</dt>
      <dd>{{recipientName}}</dd>
      <dt>Issuer</dt>
      <dd><a href="{{issuerUrl}}">{{issuerName}}</a></dd>
      <dt>Issued On</dt>
      <dd>{{issuedDate}}</dd>
      <dt>Criteria</dt>
      <dd>{{badgeCriteria}}</dd>
      <dt>Description</dt>
      <dd>{{badgeDescription}}</dd>
    </dl>
    <p style="margin-top: 24px; font-size: 0.85em; color: #999;">
      <a href="{{jsonUrl}}">View raw Verifiable Credential (JSON-LD)</a>
    </p>
  </div>
</body>
</html>`;

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? escapeHtml(vars[key]) : match;
  });
}

// GET /verify/:assertionId - HTML verification page with OG tags
router.get('/verify/:assertionId', async (req: Request, res: Response) => {
  const assertionId = req.params.assertionId as string;
  const assertion = await prisma.assertion.findUnique({
    where: { id: assertionId },
    include: { badgeClass: { include: { tenant: true } } },
  });

  if (!assertion) {
    res.status(404).send('<html><body><h1>Badge not found</h1></body></html>');
    return;
  }

  const { badgeClass } = assertion;
  const verifyUrl = `https://${APP_DOMAIN}/verify/${assertion.id}`;
  const jsonUrl = `https://${APP_DOMAIN}/api/v1/assertions/${assertion.id}`;

  const templateVars: Record<string, string> = {
    badgeName: badgeClass.name,
    badgeDescription: badgeClass.description,
    badgeImageUrl: badgeClass.imageUrl,
    badgeCriteria: badgeClass.criteria,
    recipientName: assertion.recipientName,
    recipientEmail: assertion.recipientEmail,
    issuerName: badgeClass.tenant.name,
    issuerUrl: badgeClass.tenant.url,
    issuedDate: assertion.issuedOn.toISOString().split('T')[0],
    verifyUrl,
    jsonUrl,
  };

  const template = badgeClass.templateHtml || DEFAULT_TEMPLATE;
  const html = renderTemplate(template, templateVars);

  res
    .type('html')
    .set(
      'Content-Security-Policy',
      "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    )
    .send(html);
});

// GET /api/v1/assertions/:assertionId - Raw JSON-LD credential
router.get('/api/v1/assertions/:assertionId', async (req: Request, res: Response) => {
  const assertionId = req.params.assertionId as string;
  const assertion = await prisma.assertion.findUnique({
    where: { id: assertionId },
  });

  if (!assertion) {
    res.status(404).json({ error: 'Assertion not found' });
    return;
  }

  res.type('application/ld+json').json(assertion.payloadJson);
});

// GET /keys/:tenantId - Public key document
router.get('/keys/:tenantId', async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId as string;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const keyDocument = {
    '@context': 'https://w3id.org/security/suites/ed25519-2020/v1',
    id: `https://${APP_DOMAIN}/keys/${tenant.id}#key-0`,
    type: 'Ed25519VerificationKey2020',
    controller: tenant.url,
    publicKeyMultibase: tenant.publicKeyMultibase,
  };

  res.json(keyDocument);
});

export default router;
