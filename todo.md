# TODO

## Before Production

### ~~Health check with DB connectivity~~ DONE

`/health` now queries PostgreSQL via `SELECT 1`. Returns `{ status: "ok", db: "connected" }` or `503 { status: "error", db: "unreachable" }`.

### CI pipeline

**Priority:** High
**Related:** `.github/workflows/`

Tests only run locally. A failed deploy from untested code is a matter of time.

- [ ] GitHub Actions workflow: install, build, test on push/PR
- [ ] Run `npx tsc --noEmit` + `npx vitest run`
- [ ] Cache node_modules for faster runs

### CLI tests

**Priority:** High
**Related:** `tests/`, `src/cli.ts`

The CLI manages keys and credentials — untested CLI commands are risky in production.

- [ ] Add CLI tests (tenant create/list/delete, badge create/issue, assertion list/revoke/anonymize)

---

## Feature Backlog

### OB3 Public Validator

**Priority:** High | **Full plan:** [`VALIDATOR.md`](./VALIDATOR.md)

Public-facing OB3 credential validator at `/validate` — verifies any OB3 credential (not just BONG-issued). Server-rendered UI + JSON API. SSRF-safe fetch (`src/lib/safeFetch.ts`) and proof verification service (`src/services/verify.ts`) are already built. See `VALIDATOR.md` for the complete phased implementation plan.

### OB3 REST API + OAuth2 (Priority 3)

**Priority:** Medium | **Full plan:** [`PRIORITY3.md`](./PRIORITY3.md)

Standard OB3 interoperability API (`/ims/ob/v3p0/`) with OAuth2 via `node-oidc-provider`. Adds Host/Service Provider role for machine-to-machine credential exchange. See `PRIORITY3.md` for the complete implementation plan.

### Bulk badge issuance via CSV

**Priority:** Medium
**Related:** `src/cli.ts`, `src/routes/assertions.ts`

- [ ] Add `bong badge bulk-issue <badgeId> --csv <file>` CLI command (columns: email, name)
- [ ] Add `POST /api/v1/badges/:id/bulk-issue` API endpoint
- [ ] Report success/failure per row
- [ ] Skip duplicates gracefully

### API pagination

**Priority:** Medium
**Related:** `src/routes/assertions.ts`, `src/routes/badges.ts`

- [ ] Add `?limit=` and `?offset=` query params to list endpoints
- [ ] Return pagination metadata (total, hasMore)
- [ ] Apply to CLI list commands as well

### Admin web interface

**Priority:** Medium
**Related:** `src/app.ts`

- [ ] Choose frontend approach (embedded templates vs separate SPA)
- [ ] Add authentication for admin access (session-based or JWT)
- [ ] Tenant/badge/assertion management
- [ ] Dashboard with stats

### OpenAPI / Swagger documentation

**Priority:** Low

- [ ] Add OpenAPI spec (manually or via `swagger-jsdoc`)
- [ ] Serve Swagger UI at `/docs`

### PDF certificate generation

**Priority:** Low

- [ ] Add `/verify/:assertionId/pdf` endpoint
- [ ] Add download link to verification page

### Migrate tsconfig to ES2022 modules

**Priority:** Low

- [ ] Verify `@digitalbazaar/*` packages support ESM
- [ ] Update tsconfig + package.json
- [ ] Fix CommonJS imports, test all flows

---

# Completed

## No-Delete Policy (Soft Delete + GDPR Anonymization)

Soft delete fields, cascading logic, Prisma extension, legacy credential banner, GDPR anonymization (`bong assertion anonymize`), PostgreSQL trigger blocking physical DELETEs.

## Full OB3 Compliance (W3C StatusList2021 & Linked Data)

W3C Bitstring Status List (signed, gzipped, base64url), atomic status indexing, all 30 achievement types, image baking (PNG iTXt + SVG XML), VC v2 Data Model (`validFrom`/`validUntil`), `1EdTechJsonSchemaValidator2019` credential schema, privacy-preserving identifier array.

## Salted Identity Hash

`hashEmail()` generates random 16-byte salt per credential. Salt included in `IdentityObject` and stored in `recipientSalt`.

## JSON-LD Viewer Modal

Styled modal overlay on verification page with pretty-printed JSON, copy-to-clipboard, CSP-compliant.

## Email Notifications

Nodemailer SMTP integration. Badge issuance emails with baked image attachment. Non-blocking (failures logged, never block issuance).

## Test Suite (core)

Vitest + Supertest. 132 tests covering crypto, schemas, credential signing, auth, API routes, webhooks, revocation, expiration.

## Linting & Formatting

ESLint + Prettier + Husky + lint-staged. Pre-commit hooks enforced.

## Badge Revocation

`revokedAt`/`revocationReason` fields, `POST /api/v1/assertions/:id/revoke`, CLI command, verification page status, W3C Bitstring Status List integration.

## Badge Expiration

Optional `expiresAt`, `validUntil` in VC v2 credential, verification page shows expired status.

## OB3 Compliance Priorities 1 & 2 (from COMPLIANCE.md)

- PNG baking keyword corrected (`openbadgecredential`)
- Content-Type `application/vc+ld+json` for credential responses
- Accept header negotiation (`application/vc+ld+json` + `application/ld+json`)
- All 30 AchievementType enum values
- ECDSA `ecdsa-sd-2023` cryptosuite with P-256 keys
- Achievement ID resolution (`GET /achievements/:badgeClassId`)
- Server-side cryptographic proof verification (`vc.verifyCredential()`)
- SSRF protection (`safeFetch()`)
- DID v1 context cached for proof verification
- `@context` key ordering fix for validator compatibility

## QR Code on Verification Page

Server-side QR code generation (`qrcode` package) as PNG data URI. Displayed on the verification page with "Scan to verify" label. CSP-compliant (uses `data:` img-src).

## Rate Limiting

`express-rate-limit`: public routes 60 req/min per IP, authenticated routes 30 req/min per IP. Configurable via `RATE_LIMIT_PUBLIC` and `RATE_LIMIT_AUTH` env vars.

## Request Access Logs + Log Rotation

`pino-http` middleware logs every request (method, url, status, response time). Docker log rotation configured (`max-size: 10m`, `max-file: 5`).
