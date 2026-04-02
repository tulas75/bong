-- OB-30 Compliance Audit Fixes

-- D3: Add salt column for email identity hashing (OB-30 Section 6.2.2)
ALTER TABLE "Assertion" ADD COLUMN "recipientSalt" TEXT;

-- D5: Add imageUrl column for issuer Profile image (OB-30 Profile class)
ALTER TABLE "Tenant" ADD COLUMN "imageUrl" TEXT;
