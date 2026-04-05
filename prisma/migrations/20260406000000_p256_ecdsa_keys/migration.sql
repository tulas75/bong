-- Add P-256 key columns for ECDSA ecdsa-sd-2023 cryptosuite support
ALTER TABLE "Tenant" ADD COLUMN "p256PublicKeyMultibase" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "p256PrivateKeyMultibase" TEXT;
