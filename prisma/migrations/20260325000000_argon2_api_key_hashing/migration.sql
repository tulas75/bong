-- Drop all tenants and dependent data (test data only) to cleanly migrate API key hashing
DELETE FROM "Assertion";
DELETE FROM "BadgeClass";
DELETE FROM "Tenant";

-- Drop old unique index on apiKey (argon2 hashes use random salts, lookup is by prefix now)
DROP INDEX IF EXISTS "Tenant_apiKey_key";

-- Add apiKeyPrefix column for fast lookups
ALTER TABLE "Tenant" ADD COLUMN "apiKeyPrefix" VARCHAR(16) NOT NULL;

-- Create unique index on prefix
CREATE UNIQUE INDEX "Tenant_apiKeyPrefix_key" ON "Tenant"("apiKeyPrefix");
