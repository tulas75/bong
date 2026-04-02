-- Add achievementType to BadgeClass (OB3 Achievement Type enumeration)
ALTER TABLE "BadgeClass" ADD COLUMN "achievementType" TEXT NOT NULL DEFAULT 'Badge';
