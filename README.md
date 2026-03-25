# BONG — Badge Object Node Gateway

A production-ready, multi-tenant Node.js microservice for issuing and verifying [OpenBadges 3.0](https://www.imsglobal.org/spec/ob/v3p0/) (W3C Verifiable Credentials), signed with Ed25519.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express 5
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Cryptography:** `@digitalcredentials/vc` + `Ed25519Signature2020`
- **API Key Hashing:** Argon2id
- **Validation:** Zod
- **Testing:** Vitest + Supertest

## Quick Start

```bash
# 1. Copy env file and generate an encryption key
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste the output as ENCRYPTION_KEY in .env

# 2. Start everything with Docker
docker-compose up --build -d

# 3. Create your first tenant (inside the container)
docker exec -it bong-api-1 bong tenant create --name "My Academy" --url "https://academy.example.com"
```

The API container automatically runs `prisma migrate deploy` on startup.

## CLI

The `bong` CLI manages tenants, badges, assertions, and provides stats. Available inside Docker or locally via `npm link`.

### Tenants

```bash
# Create a tenant (auto-generates Ed25519 key pair and API key)
bong tenant create --name "Acme Academy" --url "https://acme.edu"

# Create with webhook signature verification
bong tenant create --name "Acme Academy" --url "https://acme.edu" --webhook-secret "mysecret"

# List all tenants
bong tenant list

# Rotate API key (generates new Argon2id-hashed key)
bong tenant rotate-key <tenant-id>

# Delete a tenant (cascades to its badges and assertions)
bong tenant delete <tenant-id>
```

### Badges

```bash
# Create a badge class linked to an LMS course
bong badge create \
  --tenant <tenant-id> \
  --name "Python Fundamentals" \
  --description "Awarded for completing Python basics" \
  --image "https://example.com/badge.png" \
  --criteria "Pass the final exam with 80%+" \
  --course-id "PY101"

# Create with a custom verification page template
bong badge create \
  --tenant <tenant-id> \
  --name "React Advanced" \
  --description "..." \
  --image "https://example.com/badge.png" \
  --criteria "..." \
  --template ./my-template.html

# Issue a badge to a user
bong badge issue <badge-id> --email "user@example.com" --name "Full Name"

# Issue with an expiration date
bong badge issue <badge-id> --email "user@example.com" --name "Full Name" --expires 2027-01-01

# List all badges (or filter by tenant)
bong badge list
bong badge list --tenant <tenant-id>

# Delete a badge class (cascades to its assertions)
bong badge delete <badge-id>
```

Custom templates use `{{variable}}` placeholders: `{{badgeName}}`, `{{badgeDescription}}`, `{{badgeImageUrl}}`, `{{badgeCriteria}}`, `{{recipientName}}`, `{{recipientEmail}}`, `{{issuerName}}`, `{{issuerUrl}}`, `{{issuedDate}}`, `{{verifyUrl}}`, `{{jsonUrl}}`, `{{statusHtml}}`, `{{expirationHtml}}`.

### Assertions

```bash
# List all assertions (with status: active, REVOKED, EXPIRED)
bong assertion list
bong assertion list --badge <badge-id>
bong assertion list --tenant <tenant-id>

# Revoke an assertion
bong assertion revoke <assertion-id> --reason "Issued by mistake"
```

### Stats

```bash
bong stats
```

### Typical workflow

1. **Create a tenant** → `bong tenant create --name "My School" --url "https://myschool.com"` — save the printed API key
2. **Create badges** → `bong badge create --tenant <id> --course-id <lms-course-id> ...` — one per course
3. **Configure your LMS** → point your webhook to `POST https://yourdomain.com/api/v1/webhooks/course-completed` with the API key in the `X-API-Key` header
4. **Monitor** → `bong stats` and `bong assertion list`

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_USER` | PostgreSQL username | `bong` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `bong` |
| `POSTGRES_DB` | PostgreSQL database name | `bong` |
| `APP_DOMAIN` | Domain used in verification URLs | `localhost:3000` |
| `PORT` | Server port | `3000` |
| `ENCRYPTION_KEY` | 256-bit hex key for encrypting private keys at rest | **(required)** |
| `CORS_ORIGINS` | Comma-separated allowed origins (e.g., `https://myapp.com`) | empty (no CORS) |
| `LOG_LEVEL` | Pino log level (`debug`, `info`, `warn`, `error`) | `info` |

## API Endpoints

### Protected (require `X-API-Key` header)

#### `POST /api/v1/badges`

Create a new badge class.

```json
{
  "name": "React Advanced Certification",
  "description": "Awarded for completing the React Advanced course.",
  "imageUrl": "https://example.com/badge.png",
  "criteria": "Complete all modules and pass the final assessment.",
  "externalCourseId": "987654"
}
```

#### `POST /api/v1/assertions`

Issue a badge to a recipient. Returns the signed Verifiable Credential.

```json
{
  "badgeClassId": "<uuid>",
  "recipientEmail": "mario.rossi@example.com",
  "recipientName": "Mario Rossi",
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

The `expiresAt` field is optional. When provided, the VC includes an `expirationDate` and the verification page shows the expiration status.

#### `POST /api/v1/assertions/:id/revoke`

Revoke an issued assertion. The tenant must own the badge class.

```json
{
  "reason": "Issued by mistake"
}
```

Returns `409` if already revoked, `403` if the assertion belongs to another tenant.

#### `POST /api/v1/webhooks/course-completed`

Course-completion webhook handler. Automatically finds the `BadgeClass` by `externalCourseId` and issues a signed credential.

If the tenant has a webhook secret, the request must include an `X-Webhook-Signature` header with the HMAC-SHA256 hex digest of the raw body.

```json
{
  "resource": "course",
  "action": "completed",
  "payload": {
    "user": {
      "email": "mario.rossi@example.com",
      "first_name": "Mario",
      "last_name": "Rossi"
    },
    "course": {
      "id": 987654,
      "name": "Corso React Advanced"
    }
  }
}
```

### Public (no auth)

| Endpoint | Description |
|---|---|
| `GET /` | Landing page |
| `GET /verify/:assertionId` | HTML verification page (shows revocation/expiration status) |
| `GET /api/v1/assertions/:assertionId` | Raw signed Verifiable Credential (`application/ld+json`) |
| `GET /keys/:tenantId` | Tenant's public key document (Ed25519VerificationKey2020) |
| `GET /health` | Health check |

## Security

- **Private keys encrypted at rest** — AES-256-GCM with `ENCRYPTION_KEY`
- **API keys hashed with Argon2id** — memory-hard, salted; lookup via stored prefix
- **Recipient email hashed in credentials** — `sha256$<hex>` per OB3 spec
- **Webhook signature verification** — optional HMAC-SHA256 via `X-Webhook-Signature`
- **XSS prevention** — all template variables HTML-escaped
- **CSP headers** — Content Security Policy on verification pages
- **CORS** — configurable via `CORS_ORIGINS`
- **Duplicate prevention** — unique constraint on `(badgeClassId, recipientEmail)`, returns `409`
- **Audit logging** — structured pino logs for auth, issuance, revocation, and webhooks

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

102 tests covering crypto, schemas, credential signing, auth, all API routes, and revocation/expiration flows. Tests use mocked Prisma (no database required).

## Project Structure

```
├── prisma/
│   ├── schema.prisma        # Tenant, BadgeClass, Assertion models
│   ├── seed.ts              # Test data seeder
│   └── migrations/
├── src/
│   ├── index.ts             # Server entry point
│   ├── cli.ts               # Management CLI
│   ├── app.ts               # Express app + route wiring
│   ├── contexts/            # Cached JSON-LD contexts
│   ├── lib/
│   │   ├── prisma.ts        # Prisma client singleton
│   │   ├── crypto.ts        # Encryption, Argon2id, hashing
│   │   ├── logger.ts        # Pino structured logger + audit
│   │   ├── schemas.ts       # Zod validation schemas
│   │   └── documentLoader.ts
│   ├── middleware/
│   │   └── auth.ts          # X-API-Key authentication (Argon2id)
│   ├── routes/
│   │   ├── badges.ts        # Badge class creation
│   │   ├── assertions.ts    # Assertion issuance + revocation
│   │   ├── webhooks.ts      # Course-completion webhook
│   │   └── public.ts        # Verification page, raw credential, public keys
│   └── services/
│       └── credential.ts    # W3C VC issuance with Ed25519Signature2020
├── tests/
│   ├── setup.ts
│   ├── helpers/
│   ├── unit/
│   └── integration/
├── public/                  # Static assets (logo)
├── templates/               # Custom badge verification HTML templates
├── Dockerfile               # Multi-stage production build
├── docker-compose.yml
└── .env.example
```

## License

ISC
