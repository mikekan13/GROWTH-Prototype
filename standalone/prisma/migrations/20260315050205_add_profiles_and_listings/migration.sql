-- AlterTable
ALTER TABLE "CampaignApplication" ADD COLUMN "profileSnapshot" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "profile" TEXT;
ALTER TABLE "User" ADD COLUMN "watcherProfile" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "genre" TEXT,
    "themes" TEXT,
    "description" TEXT,
    "worldContext" TEXT,
    "customPrompts" TEXT,
    "applicationTemplate" TEXT,
    "listingStatus" TEXT NOT NULL DEFAULT 'UNLISTED',
    "listingDescription" TEXT,
    "listingTags" TEXT,
    "requiredFields" TEXT,
    "gmUserId" TEXT NOT NULL,
    "inviteCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "maxTrailblazers" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_gmUserId_fkey" FOREIGN KEY ("gmUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("applicationTemplate", "createdAt", "customPrompts", "description", "genre", "gmUserId", "id", "inviteCode", "maxTrailblazers", "name", "status", "themes", "worldContext") SELECT "applicationTemplate", "createdAt", "customPrompts", "description", "genre", "gmUserId", "id", "inviteCode", "maxTrailblazers", "name", "status", "themes", "worldContext" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE UNIQUE INDEX "Campaign_inviteCode_key" ON "Campaign"("inviteCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
