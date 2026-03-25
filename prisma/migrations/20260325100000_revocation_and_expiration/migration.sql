-- Add revocation and expiration fields to Assertion
ALTER TABLE "Assertion" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "Assertion" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "Assertion" ADD COLUMN "revocationReason" TEXT;
