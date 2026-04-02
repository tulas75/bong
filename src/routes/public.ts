import { Router, Request, Response } from 'express';
import { gzipSync } from 'zlib';
import { prismaUnfiltered } from '../lib/prisma.js';
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
    .status-verified { color: #22c55e; font-weight: 600; }
    .status-revoked { color: #ef4444; font-weight: 600; }
    .status-expired { color: #f59e0b; font-weight: 600; }
    .revocation-reason { color: #ef4444; font-size: 0.9em; margin-top: 4px; }
    .status-legacy { color: #6b7280; font-weight: 600; background: #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9em; line-height: 1.5; }
    .details { text-align: left; margin-top: 24px; }
    .details dt { font-weight: 600; color: #666; margin-top: 12px; }
    .details dd { margin-left: 0; }
    a { color: #3b82f6; }
    .modal-overlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:1000; align-items:center; justify-content:center; }
    .modal-overlay.active { display:flex; }
    .modal { background:#1e1e1e; border-radius:12px; width:90%; max-width:700px; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.4); }
    .modal-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #333; }
    .modal-header h2 { color:#fff; font-size:16px; margin:0; }
    .modal-close { background:none; border:none; color:#999; font-size:24px; cursor:pointer; padding:0 4px; }
    .modal-close:hover { color:#fff; }
    .modal-body { overflow:auto; padding:16px 20px; flex:1; }
    .modal-body pre { margin:0; color:#d4d4d4; font-family:'SF Mono',Monaco,Consolas,'Courier New',monospace; font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
    .modal-footer { padding:12px 20px; border-top:1px solid #333; text-align:right; }
    .btn-copy { background:#3b82f6; color:#fff; border:none; padding:8px 20px; border-radius:6px; font-size:14px; cursor:pointer; font-weight:500; }
    .btn-copy:hover { background:#2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <img src="{{badgeImageUrl}}" alt="{{badgeName}}" class="badge-image" />
    <h1>{{badgeName}}</h1>
    {{legacyHtml}}
    {{statusHtml}}
    <dl class="details">
      <dt>Recipient</dt>
      <dd>{{recipientName}}</dd>
      <dt>Issuer</dt>
      <dd><a href="{{issuerUrl}}">{{issuerName}}</a></dd>
      <dt>Issued On</dt>
      <dd>{{issuedDate}}</dd>
      {{expirationHtml}}
      <dt>Criteria</dt>
      <dd>{{badgeCriteria}}</dd>
      <dt>Description</dt>
      <dd>{{badgeDescription}}</dd>
    </dl>
    <p style="margin-top: 24px; font-size: 0.85em; color: #999;">
      <a href="#" id="view-json-link">View raw Verifiable Credential (JSON-LD)</a>
    </p>
  </div>

  <div class="modal-overlay" id="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <h2>Verifiable Credential (JSON-LD)</h2>
        <button class="modal-close" id="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <pre><code id="json-display"></code></pre>
      </div>
      <div class="modal-footer">
        <button class="btn-copy" id="btn-copy">Copy to Clipboard</button>
      </div>
    </div>
  </div>

  <script type="application/json" id="vc-json">{{credentialJson}}</script>
  <script>
    (function() {
      var overlay = document.getElementById('modal-overlay');
      var jsonDisplay = document.getElementById('json-display');
      var btnCopy = document.getElementById('btn-copy');
      var jsonStr = '';

      document.getElementById('view-json-link').addEventListener('click', function(e) {
        e.preventDefault();
        try {
          var raw = document.getElementById('vc-json').textContent;
          var data = JSON.parse(raw);
          jsonStr = JSON.stringify(data, null, 2);
          jsonDisplay.textContent = jsonStr;
        } catch(err) {
          jsonDisplay.textContent = 'Error loading credential data';
        }
        overlay.classList.add('active');
      });

      document.getElementById('modal-close').addEventListener('click', function() {
        overlay.classList.remove('active');
      });

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.classList.remove('active');
      });

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') overlay.classList.remove('active');
      });

      btnCopy.addEventListener('click', function() {
        navigator.clipboard.writeText(jsonStr).then(function() {
          btnCopy.textContent = 'Copied!';
          setTimeout(function() { btnCopy.textContent = 'Copy to Clipboard'; }, 2000);
        });
      });
    })();
  </script>
</body>
</html>`;

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? escapeHtml(vars[key]) : match;
  });
}

const RAW_HTML_KEYS = new Set(['statusHtml', 'expirationHtml', 'legacyHtml', 'credentialJson']);

function renderRawHtml(template: string, vars: Record<string, string>): string {
  // First pass: render raw HTML/JSON blocks (not escaped)
  let result = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (RAW_HTML_KEYS.has(key)) {
      return vars[key] !== undefined ? vars[key] : '';
    }
    return match;
  });
  // Second pass: render escaped variables
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? escapeHtml(vars[key]) : match;
  });
  return result;
}

// GET /verify/:assertionId - HTML verification page with OG tags
router.get('/verify/:assertionId', async (req: Request, res: Response) => {
  const assertionId = req.params.assertionId as string;
  const assertion = await prismaUnfiltered.assertion.findUnique({
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

  // Determine status
  const isRevoked = !!assertion.revokedAt;
  const isExpired = !!assertion.expiresAt && assertion.expiresAt < new Date();
  const isLegacy = !!(badgeClass.tenant as any).deletedAt || !!(badgeClass as any).deletedAt;

  let statusHtml: string;
  if (isRevoked) {
    const reason = assertion.revocationReason ? escapeHtml(assertion.revocationReason) : '';
    statusHtml = `<p class="status-revoked">Revoked</p>`;
    if (reason) statusHtml += `<p class="revocation-reason">Reason: ${reason}</p>`;
  } else if (isExpired) {
    statusHtml = `<p class="status-expired">Expired</p>`;
  } else {
    statusHtml = `<p class="status-verified">Verified Credential</p>`;
  }

  let legacyHtml = '';
  if (isLegacy) {
    legacyHtml = `<div class="status-legacy"><strong>Legacy Credential &mdash; Issuer Retired</strong><br>The original issuer is no longer active, but the validity and cryptographic signature of this historical credential remain fully confirmed.</div>`;
  }

  let expirationHtml = '';
  if (assertion.expiresAt) {
    expirationHtml = `<dt>Expires</dt><dd>${escapeHtml(assertion.expiresAt.toISOString().split('T')[0])}</dd>`;
  }

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
    statusHtml,
    legacyHtml,
    expirationHtml,
    credentialJson: JSON.stringify(assertion.payloadJson).replace(/</g, '\\u003c'),
  };

  const template = badgeClass.templateHtml || DEFAULT_TEMPLATE;
  const html = renderRawHtml(template, templateVars);

  res
    .type('html')
    .set(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    )
    .send(html);
});

// GET /api/v1/assertions/:assertionId - Raw JSON-LD credential
router.get('/api/v1/assertions/:assertionId', async (req: Request, res: Response) => {
  const assertionId = req.params.assertionId as string;
  const assertion = await prismaUnfiltered.assertion.findUnique({
    where: { id: assertionId },
  });

  if (!assertion) {
    res.status(404).json({ error: 'Assertion not found' });
    return;
  }

  const payload = assertion.payloadJson as Record<string, any>;

  if (assertion.revokedAt) {
    payload.credentialStatus = {
      type: 'RevocationStatus',
      revoked: true,
      revokedAt: assertion.revokedAt.toISOString(),
      ...(assertion.revocationReason ? { reason: assertion.revocationReason } : {}),
    };
  }

  res.type('application/ld+json').json(payload);
});

// GET /keys/:tenantId - Public key document
router.get('/keys/:tenantId', async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId as string;
  const tenant = await prismaUnfiltered.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const didKey = `did:key:${tenant.publicKeyMultibase}`;
  const keyDocument = {
    '@context': 'https://w3id.org/security/multikey/v1',
    id: `${didKey}#${tenant.publicKeyMultibase}`,
    type: 'Multikey',
    controller: didKey,
    publicKeyMultibase: tenant.publicKeyMultibase,
  };

  res.type('application/ld+json').send(JSON.stringify(keyDocument));
});

// GET /status/list/:tenantId - W3C Bitstring Status List (revocation)
router.get('/status/list/:tenantId', async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId as string;
  const tenant = await prismaUnfiltered.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  // Fetch all revoked assertions with a statusListIndex (including soft-deleted)
  const revoked = await prismaUnfiltered.assertion.findMany({
    where: { tenantId, statusListIndex: { not: null }, revokedAt: { not: null } },
    select: { statusListIndex: true },
  });

  // W3C spec mandates minimum 16KB (131,072 bits) bitstring
  const MINIMUM_BITSTRING_SIZE = 131072;
  const bitstringLength = Math.max(MINIMUM_BITSTRING_SIZE, tenant.nextStatusIndex);

  // Build bitstring buffer (MSB-first bit ordering per spec)
  const byteLength = Math.ceil(bitstringLength / 8);
  const buffer = Buffer.alloc(byteLength);
  for (const { statusListIndex } of revoked) {
    if (statusListIndex !== null) {
      const byteIndex = Math.floor(statusListIndex / 8);
      const bitIndex = 7 - (statusListIndex % 8);
      buffer[byteIndex] |= 1 << bitIndex;
    }
  }

  // GZIP compress → Base64URL (no padding)
  const compressed = gzipSync(buffer);
  const encodedList = compressed.toString('base64url');

  res.type('application/ld+json').json({
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://www.w3.org/ns/credentials/status/v1',
    ],
    id: `https://${APP_DOMAIN}/status/list/${tenantId}`,
    type: ['VerifiableCredential', 'BitstringStatusListCredential'],
    issuer: `did:key:${tenant.publicKeyMultibase}`,
    validFrom: tenant.createdAt.toISOString(),
    credentialSubject: {
      id: `https://${APP_DOMAIN}/status/list/${tenantId}#list`,
      type: 'BitstringStatusList',
      statusPurpose: 'revocation',
      encodedList,
    },
  });
});

export default router;
