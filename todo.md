# TODO



## Politica "No-Delete" (Integrità Relazionale e Database)

**Priority:** High
**Related:** `prisma/schema.prisma`, `src/cli.ts`

È vitale attuare una rigorosa politica di conservazione dati. I record rilasciati (Assertion) nel mondo delle Verifiable Credentials vanno strettamente *Revocati* e mai distrutti. L'eliminazione infrastrutturale di Tenant e BadgeClass avverrà unicamente tramite *Soft Delete*.

- [x] Aggiungere il campo `deletedAt` (`DateTime?`) in tutte le tabelle Prisma principali (`Tenant`, `BadgeClass`, `Assertion`).
- [x] Aggiungere un indice sul campo `deletedAt` (`@@index([deletedAt])`) in Prisma per ottimizzare le future iterazioni di ricerca.
- [x] Rimuovere il vincolo `@@unique([badgeClassId, recipientEmail])` nativo di Prisma e sostituirlo con una Migrazione raw SQL contenente un **Partial Unique Index** (`WHERE "deletedAt" IS NULL`).
- [x] **Logica "Cascading Soft Delete"**: la cancellazione logica (soft) di un Tenant propaga il soft delete a tutte le sue `BadgeClass`, **MA** lascia espressamente inalterate le `Assertion` già emesse, così i vecchi utenti manterranno certificati accessibili e validabili (le referenze relazionali nel DB rimarranno intatte).
- [x] Implementare un Prisma Client Extension/Middleware che converta in background le chiamate di `DELETE` in `UPDATE` (`deletedAt`) ed escluda selettivamente i record eliminati dalle normali query di lettura. **Nota Tecnica**: l'estensione dovrà fornire una configurazione di bypass o metodo raw, poiché la rotta pubblica `/verify/:id` dovrà continuare a completare le interrogazioni (FIND) estraendo le Assertion collegate a Tenant e BadgeClass soft-deleteati, prevenendo errori NotFound (404).
- [x] Aggiornare la UI della pagina di verifica (`src/routes/public.ts`): se un'Assertion valida viaggia su un Tenant o BadgeClass cancellati (`deletedAt !== null`), il template esporrà logicamente un banner "Legacy Credential / Issuer Retired" (Avviso: L'emittente originale non è più attivo, ma la validità e la firma crittografica della credenziale storica restano pienamente confermate). OpenBadges v3 sostiene by-design le credenziali decentralizzate e orfane.
- [x] Adeguare preventivamente la CLI: per Tenant e BadgeClass il comando `delete` stamperà "Record marked as deleted (Soft)". Anche per le `Assertion` il comando `delete` applicherà il Soft Delete (per nasconderle dall'Admin UI/API), specificando però che per la svalutazione ufficiale del certificato si deve usare "revoke".
- [x] **Compliance GDPR (Scrambling & Anonymization)**: Il comando (es. `bong assertion anonymize <id>`) effettuerà un obscuring irreparabile del record al posto del DBMS DELETE:
  - Campi anagrafici (`recipientEmail`, `recipientName`) sovrascritti con valori placeholder (es. `deleted@oblivion.local`).
  - `payloadJson` sovrascritto/azzerato per epurare tracce PII (es. `{"status": "anonymized"}`).
  - Hashing string: poichè `sha256$` della mail può essere craccato a dizionario, anche i campi hash vanno triturati con sequenze fittizie.
  - Questa operazione di *Scrambling* implicherà di default lo scatter del flag `deletedAt = now()`: l'Assertion diventa un record orfano occupando spazio solo a fini statistici ed impedendo conflitti infrastrutturali.
- [x] Creare un Trigger PostgreSQL con migrazione raw per bloccare fisicamente le istruzioni SQL standard di `DELETE` a livello di driver/database lanciando un EXCEPTION, ottenendo una blindatura completa.

## Open Badge v3 Compliance (StatusList2021 & Public Key)

**Priority:** High
**Related:** `src/routes/public.ts`, `prisma/schema.prisma`

- [ ] Implement a public endpoint `/status/list` following the 'W3C StatusList2021' standard. This must allow external validators to verify if a badge has been revoked by reading the `revokedAt` field in the database.
- [ ] Update the `/keys/:tenantId` route (defined in the `verificationMethod` of the JSON) to explicitly return the Public Key with the `application/ld+json` content type format, otherwise external systems cannot validate the signature.

## Implementare il Salt per l'hashing di `identityHash`

**Priority:** High
**Related:** OpenBadges v3 spec, `src/lib/crypto.ts` (`hashEmail`), `src/services/credential.ts`

L'attuale `identityHash` nei badge usa un SHA-256 non salato (`sha256$<hash>`). Dato che le email hanno bassa entropia, è necessario implementare un "Salt" univoco aggiunto all'email prima dell'hashing, per impedire che qualcuno possa risalire all'indirizzo email dell'utente tramite attacchi a dizionario (rainbow tables).

**Current behavior:**

```
sha256$63c663e3980e655afefd216a41332c4c01c5a0f8571cb6d0ce4b215f40c2755c
```

**Action items:**

- [ ] Check if OpenBadges v3 spec supports a salted identity hash format
- [ ] If salting is supported, add a per-credential random salt and include it in the `IdentityObject` (the spec has a `salt` field)
- [ ] Update `hashEmail` in `src/lib/crypto.ts` to accept an optional salt
- [ ] Update `src/services/credential.ts` to generate and pass the salt

# JSON-LD viewer modal for "View raw Verifiable Credential"#

**Priority:** Medium
**Related:** `src/routes/public.ts` (verification page template)

Currently the "View raw Verifiable Credential (JSON-LD)" link navigates to a raw JSON endpoint. Instead, display the JSON in a styled modal overlay on the verification page — similar to Badgr's "Badge Award JSON" dialog:

- [x] Add a modal/overlay triggered by the "View raw" link (no page navigation)
- [x] Show the JSON pretty-printed with syntax highlighting in a dark code block
- [x] Add a "Copy to Clipboard" button
- [x] Add a close (X) button
- [x] Keep the modal CSP-compliant (inline styles only, no external JS)

## Send email notification when a badge is issued

**Priority:** High
**Related:** `src/services/credential.ts`, `src/routes/assertions.ts`, `src/routes/webhooks.ts`, `src/cli.ts`

When a badge is issued (via API, webhook, or CLI), send an email to the recipient with:

- [x] Choose an email provider/library (Nodemailer)
- [x] Add SMTP/email configuration to `.env` (host, port, credentials, from address)
- [x] Create an email template with badge name, issuer, and verification link
- [x] Send email after successful assertion creation in all issuance paths (API, webhook, CLI)
- [x] Handle failures gracefully (log error, don't block badge issuance if email fails)

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

- [x] Set up test framework (Vitest + Supertest)
- [x] Add unit tests for `src/lib/crypto.ts` (argon2 hashing, encryption, email hashing, prefix extraction)
- [x] Add unit tests for `src/lib/schemas.ts` (Zod validation)
- [x] Add integration tests for API routes (assertions, badges, webhooks)
- [x] Add integration tests for auth middleware (valid key, invalid key, missing key)
- [x] Add integration tests for public routes (verify page, JSON-LD endpoint, keys endpoint)
- [ ] Add CLI tests (tenant create/list/delete, badge create/issue, assertion list)
- [x] Add webhook signature verification tests (valid, invalid, missing)
- [x] Add test script to `package.json`
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

- [x] Add `revokedAt` and `revocationReason` fields to Assertion model
- [x] Add `POST /api/v1/assertions/:id/revoke` endpoint
- [x] Add `bong assertion revoke <assertionId> --reason` CLI command
- [x] Show revocation status on the verification page
- [x] Include revocation status in JSON-LD credential response

## Badge expiration

**Priority:** Medium
**Related:** `prisma/schema.prisma`, `src/services/credential.ts`

Support time-limited badges that expire after a set duration.

- [x] Add optional `expiresAt` field to Assertion model
- [x] Add optional `--expires <date>` flag to badge issuance (ISO 8601 date)
- [x] Include `expirationDate` in the Verifiable Credential
- [x] Show expiration status on verification page (valid / expired)

## Bulk badge issuance via CSV

**Priority:** Medium
**Related:** `src/cli.ts`, `src/routes/assertions.ts`

Issue badges to multiple recipients at once from a CSV file.

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

## Log Rotation (Es. Winston)

**Priority:** High
**Related:** `package.json`, `src/utils/logger.ts`

L'app necessita di un sistema per non saturare lo spazio disco della VM (Elestio) coi log testuali dei servizi in esecuzione nel tempo.

- [ ] Configurare una libreria di logging avanzata (es. `winston` + `winston-daily-rotate-file`).
- [ ] Prevedere rotazione dei file di log per data/dimensioni con eventuale auto-cancellazione o storage archiviato dei log troppo vecchi.

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
