# BONG — Badge Object Node Gateway

A production-ready, multi-tenant Node.js microservice for issuing and verifying [OpenBadges 3.0](https://www.imsglobal.org/spec/ob/v3p0/) (W3C Verifiable Credentials), signed with Ed25519.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Cryptography:** `@digitalcredentials/vc` + `Ed25519Signature2020`
- **Validation:** Zod

## Quick Start

```bash
# 1. Start Postgres (exposed on port 5434)
docker-compose up -d db

# 2. Install dependencies and generate Prisma client
npm install
npx prisma generate

# 3. Apply database migrations
npx prisma migrate dev

# 4. Seed test data (prints API key and IDs)
npx ts-node prisma/seed.ts

# 5. Build and run
npm run dev
```

The seed script creates test data for quick testing. For real data, use the CLI (see below).

## CLI

The `bong` CLI manages tenants, badges, and provides stats.

### Tenants

```bash
# Create a tenant (auto-generates Ed25519 key pair and API key)
# The API key is shown ONCE — save it, it cannot be retrieved
npm run bong -- tenant create --name "Acme Academy" --url "https://acme.edu"

# Create with webhook signature verification
npm run bong -- tenant create --name "Acme Academy" --url "https://acme.edu" --webhook-secret "mysecret"

# List all tenants
npm run bong -- tenant list

# Delete a tenant (cascades to its badges and assertions)
npm run bong -- tenant delete <tenant-id>
```

### Badges

```bash
# Create a badge class linked to an LMS course
npm run bong -- badge create \
  --tenant <tenant-id> \
  --name "Python Fundamentals" \
  --description "Awarded for completing Python basics" \
  --image "https://example.com/badge.png" \
  --criteria "Pass the final exam with 80%+" \
  --course-id "PY101"

# Create with a custom verification page template
npm run bong -- badge create \
  --tenant <tenant-id> \
  --name "React Advanced" \
  --description "..." \
  --image "https://example.com/badge.png" \
  --criteria "..." \
  --template ./my-template.html

# Issue a badge to a user
npm run bong -- badge issue <badge-id> --email "user@example.com" --name "Full Name"

# List all badges (or filter by tenant)
npm run bong -- badge list
npm run bong -- badge list --tenant <tenant-id>

# Delete a badge class (cascades to its assertions)
npm run bong -- badge delete <badge-id>
```

Custom templates use `{{variable}}` placeholders: `{{badgeName}}`, `{{badgeDescription}}`, `{{badgeImageUrl}}`, `{{badgeCriteria}}`, `{{recipientName}}`, `{{recipientEmail}}`, `{{issuerName}}`, `{{issuerUrl}}`, `{{issuedDate}}`, `{{verifyUrl}}`, `{{jsonUrl}}`.

### Stats

```bash
npm run bong -- stats
```

Outputs a summary of all tenants, their badges, and assertion counts:

```
=== BONG Stats ===

Acme Academy (e762...)
  Badges: 2   Assertions: 47
    - Python Fundamentals [PY101] → 32 issued
    - React Advanced [REACT201] → 15 issued

────────────────────────────────────────
Tenants: 1   Badges: 2   Assertions: 47
```

### Typical workflow

1. **Create a tenant** → `npm run bong -- tenant create --name "My School" --url "https://myschool.com"` — save the printed API key
2. **Create badges** → `npm run bong -- badge create --tenant <id> --course-id <lms-course-id> ...` — one per course
3. **Configure your LMS** → point your webhook to `POST https://yourdomain.com/api/v1/webhooks/course-completed` with the API key in the `X-API-Key` header
4. **Monitor** → `npm run bong -- stats`

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://bong:bong@localhost:5434/bong?schema=public` |
| `APP_DOMAIN` | Domain used in verification URLs | `localhost:3000` |
| `PORT` | Server port | `3000` |
| `ENCRYPTION_KEY` | 256-bit hex key for encrypting private keys at rest | **(required)** |
| `CORS_ORIGINS` | Comma-separated allowed origins (e.g., `https://myapp.com`) | empty (no CORS) |
| `LOG_LEVEL` | Pino log level (`debug`, `info`, `warn`, `error`) | `info` |

Generate an encryption key with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## API Endpoints

### Protected (require `X-API-Key` header)

#### `POST /api/v1/badges`

Create a new badge class (certification template).

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
  "recipientName": "Mario Rossi"
}
```

#### `POST /api/v1/webhooks/course-completed`

Course-completion webhook handler. Accepts events from any LMS/e-learning platform. Automatically finds the `BadgeClass` by `externalCourseId` and issues a signed credential.

If the tenant has a webhook secret configured, the request must include an `X-Webhook-Signature` header with the HMAC-SHA256 hex digest of the raw request body.

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
| `GET /verify/:assertionId` | HTML badge verification page with Open Graph meta tags (for LinkedIn sharing) |
| `GET /api/v1/assertions/:assertionId` | Raw signed Verifiable Credential (`application/ld+json`) |
| `GET /keys/:tenantId` | Tenant's public key document (Ed25519VerificationKey2020) |
| `GET /health` | Health check |

## Security

- **Private keys encrypted at rest** — AES-256-GCM with `ENCRYPTION_KEY`, decrypted only in memory during signing
- **API keys hashed** — stored as SHA-256, shown only once at creation time
- **Recipient email hashed in credentials** — `sha256$<hex>` per OB3 spec, raw email never in the VC payload
- **Webhook signature verification** — optional HMAC-SHA256 via `X-Webhook-Signature` header (set `--webhook-secret` on tenant)
- **XSS prevention** — all template variables HTML-escaped before rendering
- **CSP headers** — Content Security Policy on verification pages
- **CORS** — configurable via `CORS_ORIGINS` env var
- **Duplicate prevention** — unique constraint on `(badgeClassId, recipientEmail)`, returns `409 Conflict`
- **Audit logging** — structured pino logs for auth failures, credential issuance, and webhook events

## Multi-Tenancy

Each **Tenant** represents an issuing organization with its own:
- Ed25519 key pair (encrypted at rest, for signing credentials)
- API key (hashed, for authenticating requests)
- Optional webhook secret (encrypted at rest, for HMAC verification)
- Badge classes and assertions

Tenants are isolated — a tenant can only manage its own badge classes and issue assertions against them.

## Docker

### Full stack

```bash
docker-compose up --build
```

This starts both PostgreSQL and the API. The API container automatically runs `prisma migrate deploy` on startup.

### Production image

The Dockerfile uses a multi-stage build:
1. **Builder stage** — installs all deps, generates Prisma client, compiles TypeScript
2. **Production stage** — copies only `dist/`, installs production deps, runs migrations + server

## Testing

Open `tests/thinkific-webhook.http` in VS Code with the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension. Replace the `{{API_KEY}}`, `{{TENANT_ID}}`, `{{BADGE_CLASS_ID}}`, and `{{ASSERTION_ID}}` placeholders with values from the seed output.

Or test with curl:

```bash
curl -s -X POST http://localhost:3000/api/v1/webhooks/course-completed \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <YOUR_SEEDED_API_KEY>" \
  -d '{
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
  }'
```

## Project Structure

```
├── prisma/
│   ├── schema.prisma        # Tenant, BadgeClass, Assertion models
│   ├── seed.ts              # Test data seeder
│   └── migrations/
├── src/
│   ├── index.ts             # Server entry point
│   ├── cli.ts               # Management CLI (tenants, badges, stats)
│   ├── app.ts               # Express app + route wiring
│   ├── contexts/            # Cached JSON-LD contexts (OB3, W3C credentials, Ed25519)
│   ├── lib/
│   │   ├── prisma.ts        # Prisma client singleton
│   │   ├── crypto.ts        # Encryption, hashing, HTML escaping utilities
│   │   ├── logger.ts        # Pino structured logger + audit logger
│   │   ├── schemas.ts       # Zod validation schemas
│   │   └── documentLoader.ts# Custom document loader (no live network calls)
│   ├── middleware/
│   │   └── auth.ts          # X-API-Key authentication
│   ├── routes/
│   │   ├── badges.ts        # Badge class CRUD
│   │   ├── assertions.ts    # Generic assertion issuance
│   │   ├── webhooks.ts      # Course-completion webhook handler
│   │   └── public.ts        # Verification page, raw credential, public keys
│   ├── services/
│   │   └── credential.ts    # W3C VC issuance with Ed25519Signature2020
│   └── types/
│       └── vc.d.ts          # Type declarations for VC libraries
├── tests/
│   └── thinkific-webhook.http
├── templates/               # Custom badge verification HTML templates
├── security-issues.md       # Security backlog
├── Dockerfile               # Multi-stage production build
├── docker-compose.yml       # Postgres + API
└── .env
```

## License

ISC
