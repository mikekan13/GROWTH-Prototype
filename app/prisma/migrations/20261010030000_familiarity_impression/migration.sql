-- AlterTable
ALTER TABLE "Familiarity" ADD COLUMN "impression" TEXT;

-- AlterTable
ALTER TABLE "FamiliarityChange" ADD COLUMN "fromImpression" TEXT;
ALTER TABLE "FamiliarityChange" ADD COLUMN "toImpression" TEXT;
