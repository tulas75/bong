# TODO

## OB3 Public Validator

**Priority:** High | **Full plan:** [`VALIDATOR.md`](./VALIDATOR.md)

Public-facing OB3 credential validator at `/validate` — verifies any OB3 credential (not just BONG-issued). Server-rendered UI + JSON API. Key concerns: rate limiting, proof verification via `vc.verifyCredential()`. SSRF-safe fetch (`src/lib/safeFetch.ts`) and proof verification service (`src/services/verify.ts`) are already built. See `VALIDATOR.md` for the complete phased implementation plan.

## OB3 REST API + OAuth2 (Priority 3)

**Priority:** Medium | **Full plan:** [`PRIORITY3.md`](./PRIORITY3.md)

Standard OB3 interoperability API (`/ims/ob/v3p0/`) with OAuth2 via `node-oidc-provider`. Adds Host/Service Provider role for machine-to-machine credential exchange. See `PRIORITY3.md` for the complete implementation plan.

## Bulk badge issuance via CSV

**Priority:** Medium
**Related:** `src/cli.ts`, `src/routes/assertions.ts`

- [ ] Add `bong badge bulk-issue <badgeId> --csv <file>` CLI command (columns: email, name)
- [ ] Add `POST /api/v1/badges/:id/bulk-issue` API endpoint
- [ ] Report success/failure per row
- [ ] Skip duplicates gracefully

## Rate limiting e Protezione Brute-Force

**Priority:** High
**Related:** `src/app.ts`, `src/routes/public.ts`

La protezione Nginx filtra i DDoS, ma l'app deve difendersi in autonomia dai tentativi di brute-force enumerativi sugli UUID dei badge.

- [ ] Aggiungere il middleware `express-rate-limit`.
- [ ] Configurare un rate limit specifico e stringente sulla rotta pubblica `GET /verify/:assertionId`.
- [ ] Mantenere rate limiting anche per le rotte autenticate e generali.

## Log Rotation

**Priority:** High
**Related:** `package.json`, `src/lib/logger.ts`

L'app necessita di un sistema per non saturare lo spazio disco della VM (Elestio) coi log testuali dei servizi in esecuzione nel tempo. L'app utilizza Pino per il logging strutturato.

- [ ] Configurare rotazione dei log (es. `pino-roll` o logrotate esterno).
- [ ] Prevedere rotazione dei file di log per data/dimensioni con eventuale auto-cancellazione o storage archiviato dei log troppo vecchi.

## API pagination

**Priority:** Medium
**Related:** `src/routes/assertions.ts`, `src/routes/badges.ts`

List endpoints currently return all results. Add cursor or offset-based pagination.

- [ ] Add `?limit=` and `?offset=` query params to list endpoints
- [ ] Return pagination metadata (total, hasMore)
- [ ] Apply to CLI list commands as well

## Test suite (remaining items)

**Priority:** Medium
**Related:** `tests/`, `package.json`

132 tests already covering crypto, schemas, credential signing, auth, all API routes, webhooks, revocation, and expiration.

- [ ] Add CLI tests (tenant create/list/delete, badge create/issue, assertion list)
- [ ] Add CI pipeline (GitHub Actions) to run tests on push/PR

## Migrate tsconfig to ES2022 modules

**Priority:** Low
**Related:** `tsconfig.json`, `package.json`

Currently the project uses `"module": "commonjs"` and `"target": "ES2020"`. Migrating to ES2022 (`"module": "Node16"` or `"NodeNext"`) would enable native ESM, top-level await, and `import.meta.url`.

- [ ] Verify `@digitalbazaar/*` packages support ESM
- [ ] Update `tsconfig.json` target/module to ES2022
- [ ] Add `"type": "module"` to `package.json`
- [ ] Fix any CommonJS-only imports (`require`, `__dirname`, etc.)
- [ ] Test all CLI, API, and webhook flows after migration

## QR code on verification page

**Priority:** Low
**Related:** `src/routes/public.ts`

- [ ] Generate QR code server-side (e.g. `qrcode` package) encoding the verify URL
- [ ] Display on verification page
- [ ] Make downloadable for recipients

## OpenAPI / Swagger documentation

**Priority:** Low
**Related:** `src/app.ts`

- [ ] Add OpenAPI spec (manually or via `swagger-jsdoc`)
- [ ] Serve Swagger UI at `/docs`
- [ ] Document all public and authenticated endpoints

## PDF certificate generation

**Priority:** Low
**Related:** `src/routes/public.ts`

- [ ] Add `/verify/:assertionId/pdf` endpoint
- [ ] Use a PDF library (e.g. `puppeteer`, `pdf-lib`, or `pdfmake`)
- [ ] Reuse the badge template for consistent styling
- [ ] Add download link to verification page

## Admin web interface

**Priority:** Medium
**Related:** `src/app.ts`

Web-based admin dashboard to manage tenants, badges, and assertions without the CLI.

- [ ] Choose frontend approach (embedded templates vs separate SPA)
- [ ] Add authentication for admin access (session-based or JWT)
- [ ] Tenant management (create, list, delete, rotate API key)
- [ ] Badge class management (create, list, delete, view assertions)
- [ ] Assertion management (list, search, revoke, view details)
- [ ] Bulk issuance UI (CSV upload)
- [ ] Dashboard with stats (total tenants, badges, assertions, recent activity)
- [ ] Protect admin routes separately from API routes

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
