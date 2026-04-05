# BONG - Open Badges 3.0 Compliance Analysis

> Assessed against [1EdTech Open Badges Specification v3.0](https://www.imsglobal.org/spec/ob/v3p0/)
> Date: 2026-04-06

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Credential Data Model | Mostly Compliant | Minor serialization issues |
| Cryptographic Proof (EdDSA) | Compliant | `eddsa-rdfc-2022` via Data Integrity |
| Cryptographic Proof (ECDSA) | Not Implemented | `ecdsa-sd-2023` required for certification |
| VC-JWT Proof | Not Implemented | Optional but limits interoperability |
| Image Baking (PNG) | Compliant | Correct iTXt keyword `openbadgecredential` |
| Image Baking (SVG) | Compliant | Correct namespace and element |
| Bitstring Status List | Compliant | Signed, gzipped, base64url encoded |
| Content Negotiation | Compliant | Uses `application/vc+ld+json`, accepts both media types |
| OB3 REST API | Not Implemented | Custom paths instead of `/ims/ob/v3p0/` |
| OAuth 2.0 | Not Implemented | Uses X-API-Key instead |
| Service Discovery | Not Implemented | No `ServiceDescriptionDocument` |
| Pagination | Not Implemented | No `X-Total-Count` / `Link` headers |
| Verification Algorithm | Partial | DB-based status check, no cryptographic verify on the server |
| AchievementType Enum | Compliant | All 30 spec values supported |
| Error Response Format | Non-Compliant | Uses `{ error }` instead of `Imsx_StatusInfo` |

**Overall**: BONG is a **strong Issuer implementation** with correct credential structure, valid Data Integrity proofs, and proper status list support. However, it is **not certifiable** in its current state due to missing ECDSA support, missing OB3 REST API endpoints, and missing OAuth 2.0. The gaps are mostly in the **API/transport layer**, not in the **credential itself**.

---

## 1. Credential Data Model (Section 4)

### COMPLIANT

| Requirement | Spec Reference | Status | Implementation |
|-------------|---------------|--------|----------------|
| `@context` array with VC v2 + OB3 | Appendix A | PASS | `['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json', ...]` |
| Context order preserved | Appendix A | PASS | VC v2 first, OB3 second |
| `id` is a resolvable URI | Section 4.1 | PASS | `https://{domain}/api/v1/assertions/{uuid}` resolves to JSON-LD |
| `type` includes both required values | Section 4.1 | PASS | `['VerifiableCredential', 'OpenBadgeCredential']` |
| `issuer` as Profile object | Section 4.1 | PASS | Object with `id`, `type: 'Profile'`, `name`, `url`, optional `image` |
| `issuer.id` is a URI | Section 4.1 | PASS | `did:key:{publicKeyMultibase}` |
| `validFrom` as ISO 8601 | Section 4.1 | PASS | `issuedOn.toISOString()` |
| `validUntil` when expiration set | Section 4.1 | PASS | Conditional, correct format |
| `credentialSubject.type` | Section 4.1 | PASS | `'AchievementSubject'` |
| `credentialSubject.identifier` | Section 4.1 | PASS | Array of `IdentityObject` with hashed email |
| `IdentityObject` fields | Section 4.4 | PASS | `type`, `identityHash`, `identityType`, `hashed`, `salt` all present |
| Email hash privacy | Section 4.4 | PASS | `sha256$` prefix, random salt per credential |
| `achievement.id` is a URI | Section 4.3 | PASS | `https://{domain}/badges/{badgeClassId}` |
| `achievement.type` = `'Achievement'` | Section 4.3 | PASS | Correct |
| `achievement.name` | Section 4.3 | PASS | From BadgeClass |
| `achievement.description` | Section 4.3 | PASS | From BadgeClass |
| `achievement.criteria` | Section 4.3 | PASS | `{ narrative: '...' }` |
| `achievement.image` | Section 4.3 | PASS | `{ id: '...', type: 'Image' }` |
| `credentialSchema` | Section 4.1 | PASS | References OB3 JSON Schema with `1EdTechJsonSchemaValidator2019` |
| `credentialStatus` | Section 4.1 | PASS | `BitstringStatusListEntry` with all required fields |
| `name` on credential | Section 4.1 | PASS | Set to badge class name |
| Null/empty values omitted | Appendix A | PASS | Conditionally spread with `...()` pattern |
| UTF-8 encoding | Section 5.1 | PASS | Default Node.js/Express behavior |

### GAPS

#### G1. `achievement.id` does not resolve (SHOULD)

**Spec**: Achievement `id` MUST be a URI. The spec recommends URIs that can be dereferenced.
**Current**: `https://{domain}/badges/{badgeClassId}` returns 404 (no route for this path pattern with a badge class ID).
**Impact**: Low. The URI is syntactically valid. Some validators may try to dereference it.
**Fix**: Add a `GET /badges/:badgeClassId` route returning Achievement JSON-LD, or redirect to issuer profile.

#### ~~G2. Incomplete `AchievementType` enum~~ FIXED

All 30 OB3 spec values now supported in the Zod validation schema (`schemas.ts`).

#### G3. No support for optional credential properties

**Spec**: The data model supports `evidence`, `endorsement`, `endorsementJwt`, `termsOfUse`, `refreshService`, `awardedDate`.
**Current**: None of these are supported in the issuance API.
**Impact**: Low. All are optional per spec. However, `evidence` is commonly used and its absence limits expressiveness.
**Fix**: Add optional `evidence` array to the assertion creation API and pass through to credential.

#### G4. `issuer.image` uses object but spec allows URI shorthand

**Spec**: Image can be either a URI string or an `Image` object.
**Current**: Always uses `{ id: '...', type: 'Image' }` object form.
**Impact**: None. Object form is correct and preferred for JSON-LD processing.

---

## 2. Cryptographic Proofs (Section 8)

### COMPLIANT

| Requirement | Spec Reference | Status | Implementation |
|-------------|---------------|--------|----------------|
| Data Integrity Proof | Section 8.3 | PASS | `DataIntegrityProof` via `@digitalbazaar/data-integrity` |
| `eddsa-rdfc-2022` cryptosuite | Section 8.3 | PASS | Ed25519Multikey + eddsa-rdfc-2022 |
| Proof `type` field | Section 8.3 | PASS | `'DataIntegrityProof'` |
| Proof `cryptosuite` field | Section 8.3 | PASS | `'eddsa-rdfc-2022'` |
| Proof `verificationMethod` | Section 8.3 | PASS | `did:key:{multibase}#{multibase}` |
| Proof `created` timestamp | Section 8.3 | PASS | Set by signing library |
| Public key never exposes private component | Section 8.2 | PASS | `privateKeyMultibase` encrypted at rest, never in responses |

### GAPS

#### G5. Missing ECDSA (`ecdsa-sd-2023`) support (MUST for certification)

**Spec**: "To pass conformance tests, issuers MUST use Data Integrity EdDSA Cryptosuites v1.0 (`eddsa-rdfc-2022`)" **AND** "MUST support Data Integrity ECDSA Cryptosuites v1.0 (`ecdsa-sd-2023`)".
**Current**: Only `eddsa-rdfc-2022` is implemented.
**Impact**: **High**. Blocks 1EdTech certification. ECDSA support enables selective disclosure (important for privacy).
**Fix**: Add `@digitalbazaar/ecdsa-sd-2023-cryptosuite` and P-256 key pair generation. Allow tenants to choose cryptosuite or issue with both.

#### G6. No VC-JWT proof support (SHOULD for interoperability)

**Spec**: VC-JWT is an alternative proof format using JWS compact serialization. `alg` MUST be `RS256` minimum.
**Current**: Not implemented. Only embedded Data Integrity proofs.
**Impact**: Medium. Many commercial badge platforms use VC-JWT. Lack of JWT support limits interoperability with those systems.
**Fix**: Add JWT signing option with RS256 (or EdDSA) algorithm. Requires JWK key management alongside Multikey.

---

## 3. Image Baking (Section 5.3)

### COMPLIANT

| Requirement | Spec Reference | Status | Implementation |
|-------------|---------------|--------|----------------|
| PNG baking via iTXt chunk | Section 5.3.1.1 | PASS | Keyword `openbadgecredential` per spec |
| PNG compression flag = 0 | Section 5.3.1.1 | PASS | `compressionFlag = Buffer.from([0])` |
| PNG: chunk before IEND | Section 5.3.1.1 | PASS | `chunks.splice(iendIndex, 0, itxtChunk)` |
| SVG namespace declaration | Section 5.3.2.1 | PASS | `xmlns:openbadges="https://purl.imsglobal.org/ob/v3p0"` |
| SVG credential element | Section 5.3.2.1 | PASS | `<openbadges:credential><![CDATA[...]]></openbadges:credential>` |
| SVG: only one credential tag | Section 5.3.2.1 | PASS | Single injection before `</svg>` |
| Supported formats: PNG + SVG | Section 5.3 | PASS | Both implemented |
| Baked content is full signed JSON | Section 5.3 | PASS | `JSON.stringify(assertion.payloadJson)` |

### ~~GAPS~~

#### ~~G7. PNG iTXt keyword~~ FIXED

Keyword corrected from `openbadgescredential` to `openbadgecredential` in `baking.ts`.

No remaining gaps in image baking.

---

## 4. Bitstring Status List (Section 9.1, W3C Bitstring Status List v1.0)

### COMPLIANT

| Requirement | Spec Reference | Status | Implementation |
|-------------|---------------|--------|----------------|
| Minimum 131,072 bits | Bitstring Status List v1.0 | PASS | `Math.max(131072, nextStatusIndex)` |
| GZIP compression | Bitstring Status List v1.0 | PASS | `gzipSync(buffer)` |
| Base64URL encoding (no padding) | Bitstring Status List v1.0 | PASS | `.toString('base64url')` |
| Bit indexing (MSB first) | Bitstring Status List v1.0 | PASS | `7 - (statusListIndex % 8)` |
| `BitstringStatusListCredential` type | Bitstring Status List v1.0 | PASS | Correct type array |
| Signed with issuer's key | Bitstring Status List v1.0 | PASS | Same Ed25519 key used |
| `statusPurpose: 'revocation'` | Bitstring Status List v1.0 | PASS | Correct |
| Credential `id` references | Section 4.1 | PASS | `credentialStatus.statusListCredential` points to resolvable URL |
| Atomic index assignment | Implementation detail | PASS | `$transaction` with `{ increment: 1 }` |

No gaps identified in status list implementation.

---

## 5. Content Negotiation & Transport (Section 5.2)

### COMPLIANT

| Requirement | Spec Reference | Status | Implementation |
|-------------|---------------|--------|----------------|
| JSON-LD response for credentials | Section 5.2 | PASS | `/api/v1/assertions/:id` returns `application/vc+ld+json` |
| Accept-based negotiation on verify | Section 5.2 | PASS | Accepts `application/vc+ld+json` and `application/ld+json` |
| Key document as JSON-LD | Section 5.2 | PASS | `/keys/:tenantId` returns `application/ld+json` |
| Status list as JSON-LD | Section 5.2 | PASS | `/status/list/:tenantId` returns `application/ld+json` |

### GAPS

#### ~~G8. Content-Type `application/vc+ld+json`~~ FIXED

Credential endpoints now respond with `application/vc+ld+json`. Non-credential JSON-LD (keys, status list) remains `application/ld+json`.

#### ~~G9. Accept header negotiation~~ FIXED

`/verify/:assertionId` now accepts both `application/vc+ld+json` and `application/ld+json` in the `Accept` header.

#### G10. TLS not enforced at application level (MUST)

**Spec**: "All secure endpoint requests MUST be made over secure TLS 1.2 or 1.3 protocol."
**Current**: Express listens on plain HTTP. TLS assumed to be handled by reverse proxy.
**Impact**: Low in production (reverse proxy), but should be documented. Credential URLs use `https://` prefix already.
**Fix**: Document TLS reverse proxy requirement. Optionally add HSTS header.

---

## 6. OB3 REST API (Section 6)

### NOT IMPLEMENTED

The spec defines a specific REST API for credential exchange between systems:

| Endpoint | Method | Path | Status |
|----------|--------|------|--------|
| getCredentials | GET | `/ims/ob/v3p0/credentials` | **Missing** |
| upsertCredential | POST | `/ims/ob/v3p0/credentials` | **Missing** |
| getProfile | GET | `/ims/ob/v3p0/profile` | **Missing** |
| putProfile | PUT | `/ims/ob/v3p0/profile` | **Missing** |
| getServiceDescription | GET | `/ims/ob/v3p0/discovery` | **Missing** |

#### G11. No OB3 standard API endpoints (MUST for Host/Service Provider certification)

**Spec**: Hosts and Service Providers MUST implement the standard REST API at the specified paths with OAuth 2.0 security.
**Current**: BONG uses custom paths (`/api/v1/badges`, `/api/v1/assertions`) with X-API-Key auth. These serve a different purpose (internal issuance management) and do not conform to the OB3 API spec.
**Impact**: **High for Host certification**. Lower for Issuer-only certification (Issuers are not required to implement the REST API, only to produce valid credentials).
**Fix**: Implement the standard OB3 API endpoints alongside existing custom endpoints. This is a significant effort involving OAuth 2.0, profile management, pagination, and standard error responses.

#### G12. No OAuth 2.0 / OpenID Connect (MUST for API)

**Spec**: The OB3 API requires OAuth 2.0 with specific scopes:
- `https://purl.imsglobal.org/spec/ob/v3p0/scope/credential.readonly`
- `https://purl.imsglobal.org/spec/ob/v3p0/scope/credential.upsert`
- `https://purl.imsglobal.org/spec/ob/v3p0/scope/profile.readonly`
- `https://purl.imsglobal.org/spec/ob/v3p0/scope/profile.update`

**Current**: Uses `X-API-Key` header authentication only.
**Impact**: **High for API certification**. X-API-Key is fine for internal/administrative use but blocks OB3 API interoperability.
**Fix**: Add OAuth 2.0 authorization server (or integrate with an external one like Keycloak). Implement token introspection, scope validation, and Dynamic Client Registration.

#### G13. No Service Discovery Document (MUST for API)

**Spec**: A `ServiceDescriptionDocument` MUST be served at the discovery endpoint, describing the server's capabilities, supported OAuth scopes, and endpoints.
**Current**: Not implemented.
**Impact**: Medium. Required for automated client configuration.
**Fix**: Implement `GET /ims/ob/v3p0/discovery` returning a `ServiceDescriptionDocument` JSON object.

#### G14. No Pagination support (MUST for Service Provider)

**Spec**: `X-Total-Count` header MUST be included if total is known. `Link` header MUST be included for incomplete responses with `next`, `last`, `first`, `prev` relations.
**Current**: No pagination on any endpoint.
**Impact**: Medium. Required for hosts managing many credentials.
**Fix**: Add `?limit=` and `?offset=` query params, generate `Link` headers per RFC 5988, include `X-Total-Count`.

#### G15. No `Imsx_StatusInfo` error responses (MUST for API)

**Spec**: All error responses MUST use the `Imsx_StatusInfo` format:
```json
{
  "imsx_codeMajor": "failure",
  "imsx_severity": "error",
  "imsx_description": "...",
  "imsx_codeMinor": {
    "imsx_codeMinorFieldValue": "invalid_data"
  }
}
```
**Current**: Simple `{ error: "..." }` objects.
**Impact**: Medium. Required for OB3 API compliance.
**Fix**: Create an error response builder conforming to `Imsx_StatusInfo` schema.

---

## 7. Verification & Validation (Section 9)

### COMPLIANT

| Requirement | Spec Reference | Status | Implementation |
|-------------|---------------|--------|----------------|
| `credentialSubject` has `identifier` | Section 9.1 step 2 | PASS | Always includes hashed email IdentityObject |
| Revocation check via status list | Section 9.1 step 5 | PASS | `/status/list/:tenantId` serves signed bitstring |
| `validFrom` / `validUntil` checks | Section 9.1 step 5 | PASS | Expiration checked in verification page |
| Credentials accessible after issuer deletion | Section 9 (implied) | PASS | Soft-delete + unfiltered Prisma for verification |

### GAPS

#### G16. No server-side cryptographic verification (SHOULD)

**Spec**: Section 9.1 defines a full verification algorithm including proof verification (step 3).
**Current**: The `/verify/:id` page only checks database fields (`revokedAt`, `expiresAt`) without verifying the cryptographic proof of the stored credential.
**Impact**: Medium. The HTML verification page shows "Verified Credential" based on database state, not actual signature verification. External validators can still verify via the raw JSON-LD endpoint.
**Fix**: Add `vc.verifyCredential()` call in the verify route (or implement the planned `/validate` endpoint from VALIDATOR.md).

#### G17. No recipient verification (RECOMMENDED)

**Spec**: Section 9.3 - "RECOMMENDED when credential exchanged as document format." Verifiers should match `credentialSubject.identifier` against a known value.
**Current**: No mechanism for a verifier to supply their email for recipient matching.
**Impact**: Low. This is a RECOMMENDED feature, not a MUST.
**Fix**: Add optional `?email=` query param to `/verify/:id` that computes the hash and compares.

#### G18. No credential equality algorithm (SHOULD)

**Spec**: Section 10 - A Host SHOULD treat credentials as equal when both `issuer.id` AND `credential.id` match, preferring the one with newer `validFrom`.
**Current**: Duplicate prevention is by `(badgeClassId, recipientEmail)`, not by credential ID.
**Impact**: Low for Issuer role. Higher if implementing Host role.
**Fix**: Implement equality check in any future `upsertCredential` endpoint.

---

## 8. Security

### COMPLIANT

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Private keys encrypted at rest | PASS | AES-256-GCM |
| API key hashing | PASS | Argon2id (64 MiB, 3 iterations) |
| Timing-safe comparisons | PASS | `crypto.timingSafeEqual()` |
| XSS prevention | PASS | HTML escaping + CSP headers |
| Email privacy in credentials | PASS | Salted SHA-256 hash |
| CORS configuration | PASS | Configurable allowed origins |

### GAPS

#### G19. No SSRF protection on image fetch (SHOULD)

**Current**: `bakeCredentialImage()` in `baking.ts` fetches arbitrary URLs from `badgeClass.imageUrl` without SSRF validation.
**Impact**: Medium. An attacker with API access could set `imageUrl` to an internal network address.
**Fix**: Implement the `safeFetch()` function described in VALIDATOR.md (block private IPs, enforce HTTPS, timeout).

---

## 9. Conformance Classes (from Certification Guide)

### Issuer Conformance

| Requirement | Status | Gap |
|-------------|--------|-----|
| Issue valid OpenBadgeCredentials | PASS | |
| `eddsa-rdfc-2022` Data Integrity | PASS | |
| `ecdsa-sd-2023` Data Integrity | FAIL | G5 |
| Credential passes schema validation | PASS | |
| Credential contains required fields | PASS | |

**Verdict**: Nearly certifiable as Issuer. Blocked by missing ECDSA support (G5).

### Displayer Conformance

| Requirement | Status | Gap |
|-------------|--------|-----|
| Display badge image, name, description | PASS | |
| Display issuer name | PASS | |
| Display issued date | PASS | |
| Display expired/revoked status | PASS | |
| Verify `eddsa-rdfc-2022` proofs | FAIL | G16 |
| Verify `ecdsa-sd-2023` proofs | FAIL | G5 |
| Viewer-initiated verification | PARTIAL | DB-only, no crypto verify |

**Verdict**: Not certifiable as Displayer. Missing cryptographic verification.

### Host Conformance

| Requirement | Status | Gap |
|-------------|--------|-----|
| OB3 REST API (`/ims/ob/v3p0/`) | FAIL | G11 |
| OAuth 2.0 | FAIL | G12 |
| Service Discovery | FAIL | G13 |
| Pagination | FAIL | G14 |
| `Imsx_StatusInfo` errors | FAIL | G15 |
| Credential round-trip preservation | FAIL | No upsert endpoint |

**Verdict**: Not certifiable as Host. This is a fundamentally different role from what BONG currently implements.

---

## 10. Prioritized Remediation Plan

### ~~Priority 1 - Quick Wins~~ DONE

All Priority 1 items resolved:

| ID | Gap | Status |
|----|-----|--------|
| G7 | PNG baking keyword `openbadgecredential` | FIXED |
| G8 | Content-Type `application/vc+ld+json` | FIXED |
| G9 | Accept header negotiation | FIXED |
| G2 | Complete AchievementType enum (30 values) | FIXED |

### Priority 2 - Issuer Certification (fix in days)

| ID | Gap | Effort | Impact |
|----|-----|--------|--------|
| G5 | ECDSA `ecdsa-sd-2023` support | 2-3 days | **Unblocks Issuer certification** |
| G1 | Achievement ID resolution | 1 day | Better validator compat |
| G16 | Server-side proof verification | 1-2 days | Honest "Verified" status |
| G19 | SSRF protection on image fetch | 1 day | Security hardening |

### Priority 3 - API Interoperability (fix in weeks)

| ID | Gap | Effort | Impact |
|----|-----|--------|--------|
| G12 | OAuth 2.0 integration | 1-2 weeks | **Required for API compliance** |
| G11 | OB3 REST API endpoints | 1-2 weeks | Standard API interop |
| G13 | Service Discovery | 1-2 days | Automated client config |
| G14 | Pagination | 2-3 days | Scalable credential listing |
| G15 | `Imsx_StatusInfo` errors | 1 day | Standard error format |

### Priority 4 - Nice to Have

| ID | Gap | Effort | Impact |
|----|-----|--------|--------|
| G6 | VC-JWT proof support | 1 week | Broader interoperability |
| G3 | Evidence / Endorsement support | 2-3 days | Richer credentials |
| G17 | Recipient verification | 1 day | Privacy-preserving verify |
| G18 | Credential equality algorithm | 1 day | Host role support |
| G10 | TLS documentation | 1 hour | Deployment guidance |

---

## Appendix A: Credential Structure Comparison

### Spec-Required Structure (minimal valid OpenBadgeCredential)

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
  ],
  "id": "https://example.com/credentials/123",
  "type": ["VerifiableCredential", "OpenBadgeCredential"],
  "issuer": {
    "id": "https://example.com/issuers/1",
    "type": "Profile",
    "name": "Example Issuer"
  },
  "validFrom": "2026-01-01T00:00:00Z",
  "credentialSubject": {
    "type": "AchievementSubject",
    "achievement": {
      "id": "https://example.com/achievements/1",
      "type": "Achievement",
      "name": "Example Badge",
      "description": "An example badge.",
      "criteria": { "narrative": "Complete the course." }
    }
  },
  "proof": { "..." }
}
```

### BONG-Issued Credential (actual output)

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    {
      "1EdTechJsonSchemaValidator2019": "https://purl.imsglobal.org/spec/vc/ob/vocab.html#1EdTechJsonSchemaValidator2019"
    }
  ],
  "id": "https://domain/api/v1/assertions/{uuid}",
  "type": ["VerifiableCredential", "OpenBadgeCredential"],
  "credentialSchema": [{
    "id": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json",
    "type": "1EdTechJsonSchemaValidator2019"
  }],
  "issuer": {
    "id": "did:key:{multibase}",
    "type": "Profile",
    "name": "Academy Name",
    "url": "https://academy.example.com",
    "image": { "id": "https://...", "type": "Image" }
  },
  "validFrom": "2026-01-15T00:00:00.000Z",
  "validUntil": "2027-01-01T00:00:00.000Z",
  "credentialStatus": {
    "id": "https://domain/status/list/{tenantId}#{index}",
    "type": "BitstringStatusListEntry",
    "statusPurpose": "revocation",
    "statusListIndex": "42",
    "statusListCredential": "https://domain/status/list/{tenantId}"
  },
  "credentialSubject": {
    "type": "AchievementSubject",
    "identifier": [{
      "type": "IdentityObject",
      "identityHash": "sha256${64-hex}",
      "identityType": "emailAddress",
      "hashed": true,
      "salt": "{32-hex}"
    }],
    "achievement": {
      "id": "https://domain/badges/{badgeClassId}",
      "type": "Achievement",
      "achievementType": "Certificate",
      "name": "Badge Name",
      "description": "...",
      "image": { "id": "https://...", "type": "Image" },
      "criteria": { "narrative": "..." }
    }
  },
  "name": "Badge Name",
  "proof": {
    "type": "DataIntegrityProof",
    "cryptosuite": "eddsa-rdfc-2022",
    "created": "2026-01-15T...",
    "verificationMethod": "did:key:{multibase}#{multibase}",
    "proofPurpose": "assertionMethod",
    "proofValue": "{base58btc-encoded}"
  }
}
```

**Differences from minimal spec**: BONG adds `credentialSchema`, `credentialStatus`, `name`, `issuer.url`, `issuer.image`, `achievement.achievementType`, `achievement.image`, `credentialSubject.identifier`. All are valid optional additions. No required fields are missing.

---

## Appendix B: Files Requiring Changes

| File | Gap(s) | Change |
|------|--------|--------|
| ~~`src/services/baking.ts:12`~~ | ~~G7~~ | ~~FIXED — keyword corrected~~ |
| ~~`src/routes/public.ts:171`~~ | ~~G9~~ | ~~FIXED — accepts both media types~~ |
| ~~`src/routes/public.ts:246`~~ | ~~G8~~ | ~~FIXED — `application/vc+ld+json`~~ |
| ~~`src/lib/schemas.ts:9-21`~~ | ~~G2~~ | ~~FIXED — all 30 values~~ |
| `src/services/credential.ts` | G5 | Add ECDSA cryptosuite option |
| `src/services/baking.ts:74` | G19 | Replace raw `fetch()` with SSRF-safe fetch |
| `src/routes/public.ts:156-233` | G16 | Add `vc.verifyCredential()` call |
| New: `src/routes/ob3api.ts` | G11-G15 | Standard OB3 API endpoints |
| New: `src/middleware/oauth.ts` | G12 | OAuth 2.0 middleware |
