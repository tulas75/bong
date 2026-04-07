/**
 * @module routes/public
 * Unauthenticated public routes: badge verification page, raw
 * JSON-LD credential retrieval, baked badge images, achievement documents,
 * public key documents, and W3C Bitstring Status List endpoints.
 */

import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { prismaUnfiltered } from '../lib/prisma.js';
import { escapeHtml, decryptField, getEncryptionKey } from '../lib/crypto.js';
import { signStatusListCredential } from '../services/statusList.js';
import { bakeCredentialImage } from '../services/baking.js';
import { verifyCredentialProof } from '../services/verify.js';

const router = Router();

const APP_DOMAIN = process.env.APP_DOMAIN || 'localhost:3000';

/** HTML template for the badge verification page, used when no custom template is set. */
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
    <div style="margin-top: 24px;">
      <img src="{{qrCodeDataUri}}" alt="QR Code" style="width:140px;height:140px;" />
      <p style="font-size: 0.75em; color: #aaa; margin-top: 4px;">Scan to verify</p>
    </div>
    <p style="margin-top: 12px; font-size: 0.85em; color: #999;">
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

/**
 * Replace `{{key}}` placeholders with HTML-escaped values.
 * @param template - HTML template string.
 * @param vars - Key-value map for placeholder substitution.
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? escapeHtml(vars[key]) : match;
  });
}

/** Template keys that should be injected as raw HTML/JSON without escaping. */
const RAW_HTML_KEYS = new Set([
  'statusHtml',
  'expirationHtml',
  'legacyHtml',
  'credentialJson',
  'qrCodeDataUri',
]);

/**
 * Render a template with two passes: raw HTML blocks first (unescaped),
 * then remaining variables (HTML-escaped).
 */
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

/**
 * Badge verification page with OG meta tags, QR code, and a modal for
 * viewing the raw Verifiable Credential JSON-LD.
 *
 * Responds with `application/vc+ld+json` if the client sends an appropriate
 * `Accept` header; otherwise renders the HTML page.
 *
 * @route GET /verify/:assertionId
 * @returns HTML page or JSON-LD credential.
 * @returns 404 — Assertion not found.
 */
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

  const accept = req.headers.accept || '';
  if (accept.includes('application/vc+ld+json') || accept.includes('application/ld+json')) {
    const payload = assertion.payloadJson as Record<string, unknown>;
    const ordered = { '@context': payload['@context'], ...payload };
    res.type('application/vc+ld+json').json(ordered);
    return;
  }

  const verifyUrl = `https://${APP_DOMAIN}/verify/${assertion.id}`;
  const jsonUrl = `https://${APP_DOMAIN}/api/v1/assertions/${assertion.id}`;

  // Determine status
  const isAnonymized = (assertion.payloadJson as any)?.status === 'anonymized';
  const isRevoked = !!assertion.revokedAt;
  const isExpired = !!assertion.expiresAt && assertion.expiresAt < new Date();
  const isLegacy = !!(badgeClass.tenant as any).deletedAt || !!(badgeClass as any).deletedAt;

  // Cryptographic proof verification (skip for anonymized credentials)
  const proofResult = isAnonymized
    ? { verified: false, error: 'Credential has been anonymized' }
    : await verifyCredentialProof(assertion.payloadJson as object);

  let statusHtml: string;
  if (isRevoked) {
    const reason = assertion.revocationReason ? escapeHtml(assertion.revocationReason) : '';
    statusHtml = `<p class="status-revoked">Revoked</p>`;
    if (reason) statusHtml += `<p class="revocation-reason">Reason: ${reason}</p>`;
  } else if (isExpired) {
    statusHtml = `<p class="status-expired">Expired</p>`;
  } else if (!proofResult.verified) {
    statusHtml = `<p class="status-revoked">Signature Invalid</p><p class="revocation-reason">${escapeHtml(proofResult.error || 'Proof verification failed')}</p>`;
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

  const qrCodeDataUri = await QRCode.toDataURL(verifyUrl, {
    width: 280,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });

  const templateVars: Record<string, string> = {
    badgeName: badgeClass.name,
    badgeDescription: badgeClass.description,
    badgeImageUrl: `https://${APP_DOMAIN}/badges/${assertion.id}/image`,
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
    qrCodeDataUri,
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

/**
 * Raw JSON-LD Verifiable Credential (immutable). Reorders keys so `@context`
 * appears first for compatibility with naive validators.
 *
 * @route GET /api/v1/assertions/:assertionId
 * @returns `application/vc+ld+json` payload.
 * @returns 404 — Assertion not found.
 */
router.get('/api/v1/assertions/:assertionId', async (req: Request, res: Response) => {
  const assertionId = req.params.assertionId as string;
  const assertion = await prismaUnfiltered.assertion.findUnique({
    where: { id: assertionId },
  });

  if (!assertion) {
    res.status(404).json({ error: 'Assertion not found' });
    return;
  }

  // PostgreSQL jsonb reorders keys by length, putting @context in the middle.
  // Re-serialize with @context first for compatibility with naive validators.
  const payload = assertion.payloadJson as Record<string, unknown>;
  const ordered = { '@context': payload['@context'], ...payload };
  res.type('application/vc+ld+json').json(ordered);
});

/**
 * Dynamically baked badge image with the signed credential embedded
 * (PNG iTXt chunk or SVG `openbadges:credential` element).
 *
 * @route GET /badges/:assertionId/image
 * @returns Baked PNG or SVG image; falls back to a redirect to the original image URL.
 * @returns 404 — Assertion not found.
 */
router.get('/badges/:assertionId/image', async (req: Request, res: Response) => {
  const assertionId = req.params.assertionId as string;
  const assertion = await prismaUnfiltered.assertion.findUnique({
    where: { id: assertionId },
    include: { badgeClass: true },
  });

  if (!assertion) {
    res.status(404).send('Not found');
    return;
  }

  const credentialJson = JSON.stringify(assertion.payloadJson);
  const baked = await bakeCredentialImage(assertion.badgeClass.imageUrl, credentialJson);

  if (!baked) {
    res.redirect(302, assertion.badgeClass.imageUrl);
    return;
  }

  const contentType = baked.extension === 'svg' ? 'image/svg+xml' : 'image/png';
  res
    .type(contentType)
    .set('Content-Disposition', `inline; filename="badge-${assertion.id}.${baked.extension}"`)
    .send(baked.buffer);
});

/**
 * Achievement JSON-LD document. Resolves `achievement.id` URIs used in
 * Verifiable Credentials.
 *
 * @route GET /achievements/:badgeClassId
 * @returns `application/ld+json` Achievement document.
 * @returns 404 — Badge class not found.
 */
router.get('/achievements/:badgeClassId', async (req: Request, res: Response) => {
  const badgeClassId = req.params.badgeClassId as string;
  const badgeClass = await prismaUnfiltered.badgeClass.findUnique({
    where: { id: badgeClassId },
    include: { tenant: true },
  });

  if (!badgeClass) {
    res.status(404).json({ error: 'Achievement not found' });
    return;
  }

  const achievement = {
    '@context': 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    id: `https://${APP_DOMAIN}/achievements/${badgeClass.id}`,
    type: 'Achievement',
    achievementType: badgeClass.achievementType || 'Badge',
    name: badgeClass.name,
    description: badgeClass.description,
    criteria: { narrative: badgeClass.criteria },
    image: { id: badgeClass.imageUrl, type: 'Image' },
    creator: {
      id: `did:key:${badgeClass.tenant.publicKeyMultibase}`,
      type: 'Profile',
      name: badgeClass.tenant.name,
      url: badgeClass.tenant.url,
    },
  };

  res.type('application/ld+json').json(achievement);
});

/**
 * Public key document for a tenant (Multikey verification method).
 *
 * @route GET /keys/:tenantId
 * @returns `application/ld+json` Multikey document.
 * @returns 404 — Tenant not found.
 */
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

/**
 * W3C Bitstring Status List credential for a tenant. Encodes revocation
 * status for all assertions and is signed with the tenant's Ed25519 key.
 *
 * @route GET /status/list/:tenantId
 * @returns `application/ld+json` signed BitstringStatusListCredential.
 * @returns 404 — Tenant not found.
 */
router.get('/status/list/:tenantId', async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId as string;
  const tenant = await prismaUnfiltered.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const revoked = await prismaUnfiltered.assertion.findMany({
    where: { tenantId, statusListIndex: { not: null }, revokedAt: { not: null } },
    select: { statusListIndex: true },
  });

  const encryptionKey = getEncryptionKey();
  const privateKeyMultibase = decryptField(tenant.privateKeyMultibase, encryptionKey);

  const signedList = await signStatusListCredential({
    tenantId,
    publicKeyMultibase: tenant.publicKeyMultibase,
    privateKeyMultibase,
    createdAt: tenant.createdAt,
    nextStatusIndex: tenant.nextStatusIndex,
    revokedIndices: revoked.map((r) => ({ statusListIndex: r.statusListIndex! })),
  });

  res.type('application/ld+json').json(signedList);
});

export default router;
