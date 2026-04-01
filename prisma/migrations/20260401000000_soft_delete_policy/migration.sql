-- Add deletedAt columns for soft delete policy
ALTER TABLE "Tenant" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "BadgeClass" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Assertion" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Add indexes on deletedAt for query optimization
CREATE INDEX "Tenant_deletedAt_idx" ON "Tenant"("deletedAt");
CREATE INDEX "BadgeClass_deletedAt_idx" ON "BadgeClass"("deletedAt");
CREATE INDEX "Assertion_deletedAt_idx" ON "Assertion"("deletedAt");

-- Replace native unique constraint with partial unique index (active records only)
DROP INDEX "Assertion_badgeClassId_recipientEmail_key";
CREATE UNIQUE INDEX "Assertion_badgeClassId_recipientEmail_key"
  ON "Assertion"("badgeClassId", "recipientEmail")
  WHERE "deletedAt" IS NULL;

-- Block physical DELETE at database level
CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Hard DELETE is prohibited. Use soft delete (SET deletedAt) instead.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_hard_delete_tenant
  BEFORE DELETE ON "Tenant" FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER no_hard_delete_badgeclass
  BEFORE DELETE ON "BadgeClass" FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER no_hard_delete_assertion
  BEFORE DELETE ON "Assertion" FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
