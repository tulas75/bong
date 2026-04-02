-- StatusList2021: Add status index tracking for W3C compliance

-- 1. Add nextStatusIndex counter to Tenant
ALTER TABLE "Tenant" ADD COLUMN "nextStatusIndex" INTEGER NOT NULL DEFAULT 0;

-- 2. Add tenantId (denormalized FK) and statusListIndex to Assertion
ALTER TABLE "Assertion" ADD COLUMN "tenantId" UUID;
ALTER TABLE "Assertion" ADD COLUMN "statusListIndex" INTEGER;

-- 3. Backfill tenantId from BadgeClass
UPDATE "Assertion" a SET "tenantId" = bc."tenantId"
FROM "BadgeClass" bc WHERE a."badgeClassId" = bc."id";

-- 4. Make tenantId NOT NULL after backfill
ALTER TABLE "Assertion" ALTER COLUMN "tenantId" SET NOT NULL;

-- 5. Add FK constraint
ALTER TABLE "Assertion" ADD CONSTRAINT "Assertion_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Backfill sequential statusListIndex per tenant (0-based)
WITH indexed AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "tenantId" ORDER BY "issuedOn" ASC, id ASC
  ) - 1 AS idx
  FROM "Assertion"
)
UPDATE "Assertion" a SET "statusListIndex" = indexed.idx
FROM indexed WHERE a.id = indexed.id;

-- 7. Sync tenant nextStatusIndex counters to match existing assertion count
UPDATE "Tenant" t SET "nextStatusIndex" = sub.cnt
FROM (
  SELECT "tenantId", COUNT(*) AS cnt FROM "Assertion" GROUP BY "tenantId"
) sub WHERE t.id = sub."tenantId";

-- 8. Partial unique index: one statusListIndex per tenant (active records only)
CREATE UNIQUE INDEX "Assertion_tenantId_statusListIndex_key"
  ON "Assertion"("tenantId", "statusListIndex")
  WHERE "deletedAt" IS NULL AND "statusListIndex" IS NOT NULL;

-- 9. Index for status list query performance
CREATE INDEX "Assertion_tenantId_idx" ON "Assertion"("tenantId");
