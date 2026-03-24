-- CreateIndex
CREATE UNIQUE INDEX "Assertion_badgeClassId_recipientEmail_key" ON "Assertion"("badgeClassId", "recipientEmail");

-- DropIndex (replaced by unique index above)
DROP INDEX IF EXISTS "Assertion_badgeClassId_idx";
