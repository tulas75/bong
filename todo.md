# TODO

## Investigate salted email hashing for identityHash

**Priority:** Low
**Related:** OpenBadges v3 spec, `src/lib/crypto.ts` (`hashEmail`), `src/services/credential.ts`

The `identityHash` in issued credentials uses unsalted SHA-256 (`sha256$<hash>`). Since email addresses have low entropy, this can be reversed via rainbow tables by anyone with access to the credential JSON.

**Current behavior:**
```
sha256$63c663e3980e655afefd216a41332c4c01c5a0f8571cb6d0ce4b215f40c2755c
```

**Action items:**
- [ ] Check if OpenBadges v3 spec supports a salted identity hash format
- [ ] If salting is supported, add a per-credential random salt and include it in the `IdentityObject` (the spec has a `salt` field)
- [ ] Update `hashEmail` in `src/lib/crypto.ts` to accept an optional salt
- [ ] Update `src/services/credential.ts` to generate and pass the salt

## JSON-LD viewer modal for "View raw Verifiable Credential"

**Priority:** Medium
**Related:** `src/routes/public.ts` (verification page template)

Currently the "View raw Verifiable Credential (JSON-LD)" link navigates to a raw JSON endpoint. Instead, display the JSON in a styled modal overlay on the verification page — similar to Badgr's "Badge Award JSON" dialog:

- [ ] Add a modal/overlay triggered by the "View raw" link (no page navigation)
- [ ] Show the JSON pretty-printed with syntax highlighting in a dark code block
- [ ] Add a "Copy to Clipboard" button
- [ ] Add a close (X) button
- [ ] Keep the modal CSP-compliant (inline styles only, no external JS)

## Send email notification when a badge is issued

**Priority:** High
**Related:** `src/services/credential.ts`, `src/routes/assertions.ts`, `src/routes/webhooks.ts`, `src/cli.ts`

When a badge is issued (via API, webhook, or CLI), send an email to the recipient with:

- [ ] Choose an email provider/library (e.g. Nodemailer, SendGrid, AWS SES)
- [ ] Add SMTP/email configuration to `.env` (host, port, credentials, from address)
- [ ] Create an email template with badge name, issuer, and verification link
- [ ] Send email after successful assertion creation in all issuance paths (API, webhook, CLI)
- [ ] Handle failures gracefully (log error, don't block badge issuance if email fails)

## Migrate tsconfig to ES2022 modules

**Priority:** Low
**Related:** `tsconfig.json`, `package.json`

Currently the project uses `"module": "commonjs"` and `"target": "ES2020"`. Migrating to ES2022 (`"module": "Node16"` or `"NodeNext"`) would enable native ESM, top-level await, and `import.meta.url`.

- [ ] Verify `@digitalcredentials/*` packages support ESM
- [ ] Update `tsconfig.json` target/module to ES2022
- [ ] Add `"type": "module"` to `package.json`
- [ ] Fix any CommonJS-only imports (`require`, `__dirname`, etc.)
- [ ] Test all CLI, API, and webhook flows after migration

## Add test suite

**Priority:** High
**Related:** `tests/`, `package.json`

The project currently has no automated tests. Add a test framework and comprehensive test coverage.

- [ ] Set up test framework (e.g. Vitest or Jest)
- [ ] Add unit tests for `src/lib/crypto.ts` (argon2 hashing, encryption, email hashing, prefix extraction)
- [ ] Add unit tests for `src/lib/schemas.ts` (Zod validation)
- [ ] Add integration tests for API routes (assertions, badges, webhooks)
- [ ] Add integration tests for auth middleware (valid key, invalid key, missing key)
- [ ] Add integration tests for public routes (verify page, JSON-LD endpoint, keys endpoint)
- [ ] Add CLI tests (tenant create/list/delete, badge create/issue, assertion list)
- [ ] Add webhook signature verification tests (valid, invalid, missing)
- [ ] Add test script to `package.json`
- [ ] Add CI pipeline (GitHub Actions) to run tests on push/PR

## Add linting and code formatting

**Priority:** Medium
**Related:** `package.json`

- [x] Set up ESLint with TypeScript plugin
- [x] Set up Prettier for consistent formatting
- [x] Add `lint` and `format` scripts to `package.json`
- [x] Add pre-commit hook (e.g. via Husky + lint-staged)
- [x] Fix any existing lint issues
- [x] Add lint check to CI pipeline

## Badge revocation

**Priority:** High
**Related:** `src/routes/assertions.ts`, `prisma/schema.prisma`

Ability to revoke issued badges (e.g. if issued by mistake or recipient no longer qualifies). Essential for any credentialing system.

- [ ] Add `revokedAt` and `revocationReason` fields to Assertion model
- [ ] Add `POST /api/v1/assertions/:id/revoke` endpoint
- [ ] Add `bong badge revoke <assertionId>` CLI command
- [ ] Show revocation status on the verification page
- [ ] Include revocation status in JSON-LD credential response

## Badge expiration

**Priority:** Medium
**Related:** `prisma/schema.prisma`, `src/services/credential.ts`

Support time-limited badges that expire after a set duration.

- [ ] Add optional `expiresAt` field to Assertion model
- [ ] Add optional `--expires <duration>` flag to badge issuance (e.g. `--expires 1y`, `--expires 6m`)
- [ ] Include `expirationDate` in the Verifiable Credential
- [ ] Show expiration status on verification page (valid / expired)

## Bulk badge issuance via CSV

**Priority:** Medium
**Related:** `src/cli.ts`, `src/routes/assertions.ts`

Issue badges to multiple recipients at once from a CSV file.

- [ ] Add `bong badge bulk-issue <badgeId> --csv <file>` CLI command (columns: email, name)
- [ ] Add `POST /api/v1/badges/:id/bulk-issue` API endpoint
- [ ] Report success/failure per row
- [ ] Skip duplicates gracefully

## Rate limiting

**Priority:** Medium
**Related:** `src/app.ts` (already flagged in security review as LOW)

- [ ] Add `express-rate-limit` middleware
- [ ] Apply stricter limits to public/unauthenticated routes
- [ ] Apply per-tenant limits to authenticated routes
- [ ] Add rate limit config to `.env`

## QR code on verification page

**Priority:** Low
**Related:** `src/routes/public.ts`

Add a QR code to the badge verification page for easy sharing/scanning.

- [ ] Generate QR code server-side (e.g. `qrcode` package) encoding the verify URL
- [ ] Display on verification page
- [ ] Make downloadable for recipients

## API pagination

**Priority:** Medium
**Related:** `src/routes/assertions.ts`, `src/routes/badges.ts`

List endpoints currently return all results. Add cursor or offset-based pagination.

- [ ] Add `?limit=` and `?offset=` query params to list endpoints
- [ ] Return pagination metadata (total, hasMore)
- [ ] Apply to CLI list commands as well

## OpenAPI / Swagger documentation

**Priority:** Low
**Related:** `src/app.ts`

- [ ] Add OpenAPI spec (manually or via `swagger-jsdoc`)
- [ ] Serve Swagger UI at `/docs`
- [ ] Document all public and authenticated endpoints

## PDF certificate generation

**Priority:** Low
**Related:** `src/routes/public.ts`

Generate a downloadable PDF certificate from the verification page.

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
