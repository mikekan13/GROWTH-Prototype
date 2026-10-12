-- AlterTable
ALTER TABLE "User" ADD COLUMN "dateOfBirth" DATETIME;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "adultOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Campaign" ADD COLUMN "adultOnlySetBy" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "adultOnlyAt" DATETIME;
